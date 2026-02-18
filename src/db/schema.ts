import {
  pgTable,
  serial,
  integer,
  bigint,
  text,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

export const llmProviderEnum = pgEnum("llm_provider", [
  "openai",
  "anthropic",
  "gemini",
]);

export const reviewStyleEnum = pgEnum("review_style", [
  "inline",
  "summary",
  "both",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const installations = pgTable("installations", {
  id: serial("id").primaryKey(),
  githubInstallationId: integer("github_installation_id").notNull().unique(),
  githubAccountLogin: text("github_account_login").notNull(),
  githubAccountType: text("github_account_type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const installationSettings = pgTable("installation_settings", {
  id: serial("id").primaryKey(),
  installationId: integer("installation_id")
    .references(() => installations.id)
    .notNull()
    .unique(),
  llmProvider: llmProviderEnum("llm_provider").default("openai").notNull(),
  llmModel: text("llm_model").default("gpt-4o").notNull(),
  reviewStyle: reviewStyleEnum("review_style").default("both").notNull(),
  apiKeyEncrypted: text("api_key_encrypted"),
  apiKeyIv: text("api_key_iv"),
  apiKeyAuthTag: text("api_key_auth_tag"),
  ignorePaths: text("ignore_paths")
    .array()
    .default([".lock", "*.min.js", "*.min.css"])
    .notNull(),
  customInstructions: text("custom_instructions"),
  maxFilesPerReview: integer("max_files_per_review").default(20).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  installationId: integer("installation_id")
    .references(() => installations.id)
    .notNull(),
  repoFullName: text("repo_full_name").notNull(),
  prNumber: integer("pr_number").notNull(),
  prTitle: text("pr_title").notNull(),
  commitSha: text("commit_sha").notNull(),
  llmProvider: llmProviderEnum("llm_provider").notNull(),
  llmModel: text("llm_model").notNull(),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  status: reviewStatusEnum("status").default("pending").notNull(),
  summaryComment: text("summary_comment"),
  inlineCommentCount: integer("inline_comment_count").default(0).notNull(),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const reviewJobs = pgTable("review_jobs", {
  id: serial("id").primaryKey(),
  // Stores the GitHub installation ID (not the internal installations.id PK)
  installationId: integer("installation_id").notNull(),
  repoFullName: text("repo_full_name").notNull(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  prNumber: integer("pr_number").notNull(),
  prTitle: text("pr_title").notNull(),
  commitSha: text("commit_sha").notNull(),
  baseBranch: text("base_branch").notNull(),
  status: reviewStatusEnum("status").default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(3).notNull(),
  errorMessage: text("error_message"),
  // bigint: GitHub check run IDs are 64-bit and can exceed int4's max of ~2.1B
  checkRunId: bigint("check_run_id", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  githubUserId: integer("github_user_id").notNull(),
  githubUsername: text("github_username").notNull(),
  githubAvatar: text("github_avatar"),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  accessTokenIv: text("access_token_iv").notNull(),
  accessTokenAuthTag: text("access_token_auth_tag").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
