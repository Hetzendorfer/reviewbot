import { Elysia } from "elysia"
import { eq } from "drizzle-orm"
import { Octokit } from "octokit"
import { getDb } from "../db/index.js"
import { installations, installationSettings, sessions } from "../db/schema.js"
import { loadConfig } from "../config.js"
import { validateSession } from "./auth.js"
import { encrypt, decrypt } from "../crypto.js"
import { logger } from "../logger.js"

function getAccessToken(session: typeof sessions.$inferSelect): string {
  const config = loadConfig()
  return decrypt({
    ciphertext: session.accessTokenEncrypted,
    iv: session.accessTokenIv,
    authTag: session.accessTokenAuthTag,
  }, config.ENCRYPTION_KEY)
}

async function userHasInstallationAccess(
  session: typeof sessions.$inferSelect,
  installationId: number
): Promise<boolean> {
  try {
    const octokit = new Octokit({ auth: getAccessToken(session) })
    // GitHub returns 404/403 if the user does not have access to this installation,
    // so this implicitly verifies ownership without needing to paginate all installations.
    await octokit.request("GET /user/installations/{installation_id}/repositories", {
      installation_id: installationId,
      per_page: 1,
    })
    return true
  } catch {
    return false
  }
}

const DEFAULT_SETTINGS = {
  llmProvider: "openai",
  llmModel: "gpt-4o",
  reviewStyle: "both",
  hasApiKey: false,
  ignorePaths: [".lock", "*.min.js", "*.min.css"],
  customInstructions: "",
  maxFilesPerReview: 20,
  enabled: true,
}

const MAX_INSTRUCTIONS_LENGTH = 2000
const MAX_IGNORE_PATHS = 50
const MAX_PATH_LENGTH = 256

function validateSettings(body: Record<string, unknown>): string | null {
  if (body.customInstructions && typeof body.customInstructions === "string") {
    if (body.customInstructions.length > MAX_INSTRUCTIONS_LENGTH) {
      return `Custom instructions too long (max ${MAX_INSTRUCTIONS_LENGTH} chars)`
    }
  }

  if (body.ignorePaths && Array.isArray(body.ignorePaths)) {
    if (body.ignorePaths.length > MAX_IGNORE_PATHS) {
      return `Too many ignore paths (max ${MAX_IGNORE_PATHS})`
    }
    for (const path of body.ignorePaths) {
      if (typeof path !== "string" || path.length > MAX_PATH_LENGTH) {
        return "Invalid ignore path"
      }
    }
  }

  if (body.maxFilesPerReview !== undefined) {
    const max = Number(body.maxFilesPerReview)
    if (isNaN(max) || max < 1 || max > 100) {
      return "maxFilesPerReview must be between 1 and 100"
    }
  }

  return null
}

async function validateApiKey(
  provider: string,
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    switch (provider) {
      case "openai": {
        const { OpenAI } = await import("openai")
        const client = new OpenAI({ apiKey })
        await client.models.list()
        return { valid: true }
      }
      case "anthropic": {
        const Anthropic = (await import("@anthropic-ai/sdk")).default
        const client = new Anthropic({ apiKey })
        await client.messages.countTokens({
          model: "claude-haiku-4-5-20251001",
          messages: [{ role: "user", content: "hi" }],
        })
        return { valid: true }
      }
      case "gemini": {
        const { GoogleGenerativeAI } = await import("@google/generative-ai")
        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })
        await model.generateContent({
          contents: [{ role: "user", parts: [{ text: "hi" }] }],
          generationConfig: { maxOutputTokens: 1 },
        })
        return { valid: true }
      }
      default:
        return { valid: false, error: "Unknown provider" }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return { valid: false, error: `API key validation failed: ${message}` }
  }
}

export const installationsRoutes = new Elysia({ prefix: "/api/installations" })
  .get("/", async ({ cookie, set }) => {
    const session = await validateSession(cookie.session?.value as string | undefined)
    if (!session) {
      set.status = 401
      return { error: "Not authenticated" }
    }

    try {
      const octokit = new Octokit({ auth: getAccessToken(session) })
      const { data } = await octokit.request("GET /user/installations")

      const installList = data.installations.map((inst) => {
        const account = inst.account as Record<string, unknown> | null
        return {
          id: inst.id,
          account: account?.login ?? account?.name ?? "unknown",
          avatar: (account?.avatar_url as string) ?? "",
          type: (account?.type as string) ?? (account?.login ? "User" : "Organization"),
          selection: inst.repository_selection,
        }
      })

      return { installations: installList }
    } catch (err) {
      logger.error("Failed to fetch installations", { error: String(err) })
      set.status = 500
      return { error: "Failed to fetch installations" }
    }
  })
  .get("/:installationId/repos", async ({ params, cookie, set }) => {
    const session = await validateSession(cookie.session?.value as string | undefined)
    if (!session) {
      set.status = 401
      return { error: "Not authenticated" }
    }

    const installationId = parseInt(params.installationId)
    if (isNaN(installationId)) {
      set.status = 400
      return { error: "Invalid installation ID" }
    }

    try {
      const octokit = new Octokit({ auth: getAccessToken(session) })
      const { data } = await octokit.request(
        "GET /user/installations/{installation_id}/repositories",
        { installation_id: installationId }
      )

      const repos = data.repositories.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
      }))

      return { repos }
    } catch (err) {
      logger.error("Failed to fetch repos", { error: String(err) })
      set.status = 500
      return { error: "Failed to fetch repositories" }
    }
  })
  .get("/:installationId/settings", async ({ params, cookie, set }) => {
    const session = await validateSession(cookie.session?.value as string | undefined)
    if (!session) {
      set.status = 401
      return { error: "Not authenticated" }
    }

    const installationId = parseInt(params.installationId)
    if (isNaN(installationId)) {
      set.status = 400
      return { error: "Invalid installation ID" }
    }

    if (!await userHasInstallationAccess(session, installationId)) {
      set.status = 403
      return { error: "Access denied" }
    }

    const db = getDb()

    const [installation] = await db
      .select()
      .from(installations)
      .where(eq(installations.githubInstallationId, installationId))
      .limit(1)

    if (!installation) {
      return { installationId, ...DEFAULT_SETTINGS }
    }

    const [settings] = await db
      .select()
      .from(installationSettings)
      .where(eq(installationSettings.installationId, installation.id))
      .limit(1)

    if (!settings) {
      return { installationId, ...DEFAULT_SETTINGS }
    }

    return {
      installationId,
      llmProvider: settings.llmProvider,
      llmModel: settings.llmModel,
      reviewStyle: settings.reviewStyle,
      hasApiKey: !!settings.apiKeyEncrypted,
      ignorePaths: settings.ignorePaths,
      customInstructions: settings.customInstructions ?? "",
      maxFilesPerReview: settings.maxFilesPerReview,
      enabled: settings.enabled,
    }
  })
  .put("/:installationId/settings", async ({ params, body, cookie, set }) => {
    const session = await validateSession(cookie.session?.value as string | undefined)
    if (!session) {
      set.status = 401
      return { error: "Not authenticated" }
    }

    const validationError = validateSettings(body as Record<string, unknown>)
    if (validationError) {
      set.status = 400
      return { error: validationError }
    }

    const githubInstallationId = parseInt(params.installationId)
    if (isNaN(githubInstallationId)) {
      set.status = 400
      return { error: "Invalid installation ID" }
    }

    if (!await userHasInstallationAccess(session, githubInstallationId)) {
      set.status = 403
      return { error: "Access denied" }
    }

    const db = getDb()
    const config = loadConfig()

    let [installation] = await db
      .select()
      .from(installations)
      .where(eq(installations.githubInstallationId, githubInstallationId))
      .limit(1)

    if (!installation) {
      try {
        const octokit = new Octokit({ auth: getAccessToken(session) })
        const { data: listData } = await octokit.request("GET /user/installations")
        const instData = listData.installations.find(
          (i) => i.id === githubInstallationId
        )
        if (!instData) {
          set.status = 400
          return { error: "Failed to verify installation" }
        }

        const account = instData.account as Record<string, unknown> | null
        const [newInstall] = await db
          .insert(installations)
          .values({
            githubInstallationId,
            githubAccountLogin: (account?.login as string) ?? "unknown",
            githubAccountType: (account?.type as string) ?? "User",
          })
          .returning()

        installation = newInstall
      } catch {
        set.status = 400
        return { error: "Failed to verify installation" }
      }
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    const bodyObj = body as Record<string, unknown>

    if (bodyObj.llmProvider) updateData.llmProvider = bodyObj.llmProvider
    if (bodyObj.llmModel) updateData.llmModel = bodyObj.llmModel
    if (bodyObj.reviewStyle) updateData.reviewStyle = bodyObj.reviewStyle
    if (bodyObj.ignorePaths) updateData.ignorePaths = bodyObj.ignorePaths
    if (bodyObj.customInstructions !== undefined)
      updateData.customInstructions = bodyObj.customInstructions
    if (bodyObj.maxFilesPerReview) updateData.maxFilesPerReview = bodyObj.maxFilesPerReview
    if (bodyObj.enabled !== undefined) updateData.enabled = bodyObj.enabled

    if (bodyObj.apiKey && typeof bodyObj.apiKey === "string") {
      const provider = (bodyObj.llmProvider as string | undefined) ?? "openai"
      const result = await validateApiKey(provider, bodyObj.apiKey)
      if (!result.valid) {
        set.status = 400
        return { error: result.error ?? "Invalid API key" }
      }

      const encrypted = encrypt(bodyObj.apiKey, config.ENCRYPTION_KEY)
      updateData.apiKeyEncrypted = encrypted.ciphertext
      updateData.apiKeyIv = encrypted.iv
      updateData.apiKeyAuthTag = encrypted.authTag
    }

    const [existing] = await db
      .select()
      .from(installationSettings)
      .where(eq(installationSettings.installationId, installation.id))
      .limit(1)

    if (existing) {
      await db
        .update(installationSettings)
        .set(updateData)
        .where(eq(installationSettings.id, existing.id))
    } else {
      await db.insert(installationSettings).values({
        installationId: installation.id,
        ...updateData,
      })
    }

    return { status: "saved" }
  })
  .get("/install-url", async ({ cookie, set }) => {
    const session = await validateSession(cookie.session?.value as string | undefined)
    if (!session) {
      set.status = 401
      return { error: "Not authenticated" }
    }

    const config = loadConfig()
    const url = `https://github.com/apps/${config.GITHUB_APP_SLUG}/installations/new`
    
    return { url }
  })
