import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { installations, installationSettings } from "../db/schema.js";
import { encrypt } from "../crypto.js";
import { loadConfig } from "../config.js";

const MAX_INSTRUCTIONS_LENGTH = 2000;
const MAX_IGNORE_PATHS = 50;
const MAX_PATH_LENGTH = 256;

function validateSettings(body: Record<string, unknown>): string | null {
  if (body.customInstructions && typeof body.customInstructions === "string") {
    if (body.customInstructions.length > MAX_INSTRUCTIONS_LENGTH) {
      return `Custom instructions too long (max ${MAX_INSTRUCTIONS_LENGTH} chars)`;
    }
  }

  if (body.ignorePaths && Array.isArray(body.ignorePaths)) {
    if (body.ignorePaths.length > MAX_IGNORE_PATHS) {
      return `Too many ignore paths (max ${MAX_IGNORE_PATHS})`;
    }
    for (const path of body.ignorePaths) {
      if (typeof path !== "string" || path.length > MAX_PATH_LENGTH) {
        return "Invalid ignore path";
      }
    }
  }

  if (body.maxFilesPerReview !== undefined) {
    const max = Number(body.maxFilesPerReview);
    if (isNaN(max) || max < 1 || max > 100) {
      return "maxFilesPerReview must be between 1 and 100";
    }
  }

  return null;
}

async function validateApiKey(
  provider: string,
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    switch (provider) {
      case "openai": {
        const { OpenAI } = await import("openai");
        const client = new OpenAI({ apiKey });
        await client.models.list();
        return { valid: true };
      }
      case "anthropic": {
        if (!apiKey.startsWith("sk-ant-")) {
          return { valid: false, error: "Anthropic keys must start with 'sk-ant-'" };
        }
        if (apiKey.length < 50) {
          return { valid: false, error: "Anthropic key appears too short" };
        }
        return { valid: true };
      }
      case "gemini": {
        if (!/^[A-Za-z0-9_-]{30,}$/.test(apiKey)) {
          return { valid: false, error: "Invalid Gemini key format" };
        }
        return { valid: true };
      }
      default:
        return { valid: false, error: "Unknown provider" };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { valid: false, error: `API key validation failed: ${message}` };
  }
}

export const settingsRoutes = new Elysia({ prefix: "/api/settings" })
  .get("/:installationId", async ({ params, set }) => {
    const db = getDb();
    const installationId = parseInt(params.installationId);

    const [installation] = await db
      .select()
      .from(installations)
      .where(eq(installations.githubInstallationId, installationId))
      .limit(1);

    if (!installation) {
      set.status = 404;
      return { error: "Installation not found" };
    }

    const [settings] = await db
      .select()
      .from(installationSettings)
      .where(eq(installationSettings.installationId, installation.id))
      .limit(1);

    if (!settings) {
      return {
        installationId,
        llmProvider: "openai",
        llmModel: "gpt-4o",
        reviewStyle: "both",
        hasApiKey: false,
        ignorePaths: [".lock", "*.min.js", "*.min.css"],
        customInstructions: "",
        maxFilesPerReview: 20,
        enabled: true,
      };
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
    };
  })
  .put(
    "/:installationId",
    async ({ params, body, set }) => {
      const validationError = validateSettings(body as Record<string, unknown>);
      if (validationError) {
        set.status = 400;
        return { error: validationError };
      }

      const db = getDb();
      const config = loadConfig();
      const githubInstallationId = parseInt(params.installationId);

      const [installation] = await db
        .select()
        .from(installations)
        .where(eq(installations.githubInstallationId, githubInstallationId))
        .limit(1);

      if (!installation) {
        // Auto-create installation record
        const [newInstall] = await db
          .insert(installations)
          .values({
            githubInstallationId,
            githubAccountLogin: body.accountLogin ?? "unknown",
            githubAccountType: body.accountType ?? "User",
          })
          .returning();

        const result = await upsertSettings(db, config, newInstall.id, body);
        if ("error" in result) set.status = 400;
        return result;
      }

      const result = await upsertSettings(db, config, installation.id, body);
      if ("error" in result) set.status = 400;
      return result;
    },
    {
      body: t.Object({
        llmProvider: t.Optional(
          t.Union([
            t.Literal("openai"),
            t.Literal("anthropic"),
            t.Literal("gemini"),
          ])
        ),
        llmModel: t.Optional(t.String()),
        reviewStyle: t.Optional(
          t.Union([
            t.Literal("inline"),
            t.Literal("summary"),
            t.Literal("both"),
          ])
        ),
        apiKey: t.Optional(t.String()),
        ignorePaths: t.Optional(t.Array(t.String())),
        customInstructions: t.Optional(t.String()),
        maxFilesPerReview: t.Optional(t.Number()),
        enabled: t.Optional(t.Boolean()),
        accountLogin: t.Optional(t.String()),
        accountType: t.Optional(t.String()),
      }),
    }
  );

async function upsertSettings(
  db: ReturnType<typeof getDb>,
  config: { ENCRYPTION_KEY: string },
  installationId: number,
  body: Record<string, unknown>
) {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (body.llmProvider) updateData.llmProvider = body.llmProvider;
  if (body.llmModel) updateData.llmModel = body.llmModel;
  if (body.reviewStyle) updateData.reviewStyle = body.reviewStyle;
  if (body.ignorePaths) updateData.ignorePaths = body.ignorePaths;
  if (body.customInstructions !== undefined)
    updateData.customInstructions = body.customInstructions;
  if (body.maxFilesPerReview) updateData.maxFilesPerReview = body.maxFilesPerReview;
  if (body.enabled !== undefined) updateData.enabled = body.enabled;

  if (body.apiKey && typeof body.apiKey === "string") {
    const result = await validateApiKey(body.llmProvider as string ?? "openai", body.apiKey);
    if (!result.valid) {
      return { error: result.error ?? "Invalid API key" };
    }
    
    const encrypted = encrypt(body.apiKey, config.ENCRYPTION_KEY);
    updateData.apiKeyEncrypted = encrypted.ciphertext;
    updateData.apiKeyIv = encrypted.iv;
    updateData.apiKeyAuthTag = encrypted.authTag;
  }

  const [existing] = await db
    .select()
    .from(installationSettings)
    .where(eq(installationSettings.installationId, installationId))
    .limit(1);

  if (existing) {
    await db
      .update(installationSettings)
      .set(updateData)
      .where(eq(installationSettings.id, existing.id));
  } else {
    await db.insert(installationSettings).values({
      installationId,
      ...updateData,
    });
  }

  return { status: "saved" };
}
