import { Elysia } from "elysia"
import { eq } from "drizzle-orm"
import { Octokit } from "octokit"
import { getDb } from "../db/index.js"
import { installations, installationSettings, sessions } from "../db/schema.js"
import { loadConfig } from "../config.js"
import { validateSession } from "./auth.js"
import { encrypt } from "../crypto.js"
import {
  getAccessToken,
  userHasInstallationAccess,
} from "./github-installations.js"
import { logger } from "../logger.js"
import { generateText } from "ai"
import {
  createProviderModel,
  getValidationModelId,
  isProviderName,
} from "../llm/provider-factory.js"

const DEFAULT_SETTINGS = {
  llmProvider: "openai",
  llmModel: "gpt-5.4",
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

export function requiresNewApiKeyOnProviderChange(
  previousProvider: string | null,
  nextProvider: string,
  hasNewApiKey: boolean
): boolean {
  return previousProvider !== null && previousProvider !== nextProvider && !hasNewApiKey
}

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
    if (!isProviderName(provider)) {
      return { valid: false, error: "Unknown provider" }
    }

    await generateText({
      model: createProviderModel(provider, apiKey, getValidationModelId(provider)),
      prompt: "Reply with OK.",
      temperature: 0,
    })

    return { valid: true }
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

    const [existing] = await db
      .select()
      .from(installationSettings)
      .where(eq(installationSettings.installationId, installation.id))
      .limit(1)

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    const bodyObj = body as Record<string, unknown>
    const nextProvider =
      typeof bodyObj.llmProvider === "string"
        ? bodyObj.llmProvider
        : existing?.llmProvider ?? DEFAULT_SETTINGS.llmProvider
    const hasNewApiKey = typeof bodyObj.apiKey === "string" && bodyObj.apiKey.length > 0

    if (
      requiresNewApiKeyOnProviderChange(
        existing?.llmProvider ?? null,
        nextProvider,
        hasNewApiKey
      )
    ) {
      set.status = 400
      return {
        error: "Changing the LLM provider requires a new API key for that provider",
      }
    }

    if (bodyObj.llmProvider) updateData.llmProvider = bodyObj.llmProvider
    if (bodyObj.llmModel) updateData.llmModel = bodyObj.llmModel
    if (bodyObj.reviewStyle) updateData.reviewStyle = bodyObj.reviewStyle
    if (bodyObj.ignorePaths) updateData.ignorePaths = bodyObj.ignorePaths
    if (bodyObj.customInstructions !== undefined)
      updateData.customInstructions = bodyObj.customInstructions
    if (bodyObj.maxFilesPerReview) updateData.maxFilesPerReview = bodyObj.maxFilesPerReview
    if (bodyObj.enabled !== undefined) updateData.enabled = bodyObj.enabled

    if (hasNewApiKey) {
      const provider = nextProvider
      const apiKey = bodyObj.apiKey as string
      const result = await validateApiKey(provider, apiKey)
      if (!result.valid) {
        set.status = 400
        return { error: result.error ?? "Invalid API key" }
      }

      const encrypted = encrypt(apiKey, config.ENCRYPTION_KEY)
      updateData.apiKeyEncrypted = encrypted.ciphertext
      updateData.apiKeyIv = encrypted.iv
      updateData.apiKeyAuthTag = encrypted.authTag
    }

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
