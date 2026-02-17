CREATE TYPE "public"."llm_provider" AS ENUM('openai', 'anthropic', 'gemini');
CREATE TYPE "public"."review_status" AS ENUM('pending', 'processing', 'completed', 'failed');
CREATE TYPE "public"."review_style" AS ENUM('inline', 'summary', 'both');
CREATE TABLE "installation_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"installation_id" integer NOT NULL,
	"llm_provider" "llm_provider" DEFAULT 'openai' NOT NULL,
	"llm_model" text DEFAULT 'gpt-4o' NOT NULL,
	"review_style" "review_style" DEFAULT 'both' NOT NULL,
	"api_key_encrypted" text,
	"api_key_iv" text,
	"api_key_auth_tag" text,
	"ignore_paths" text[] DEFAULT '{".lock","*.min.js","*.min.css"}' NOT NULL,
	"custom_instructions" text,
	"max_files_per_review" integer DEFAULT 20 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "installation_settings_installation_id_unique" UNIQUE("installation_id")
);
CREATE TABLE "installations" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_installation_id" integer NOT NULL,
	"github_account_login" text NOT NULL,
	"github_account_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "installations_github_installation_id_unique" UNIQUE("github_installation_id")
);
CREATE TABLE "review_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"installation_id" integer NOT NULL,
	"repo_full_name" text NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"pr_number" integer NOT NULL,
	"pr_title" text NOT NULL,
	"commit_sha" text NOT NULL,
	"base_branch" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"error_message" text,
	"check_run_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"installation_id" integer NOT NULL,
	"repo_full_name" text NOT NULL,
	"pr_number" integer NOT NULL,
	"pr_title" text NOT NULL,
	"commit_sha" text NOT NULL,
	"llm_provider" "llm_provider" NOT NULL,
	"llm_model" text NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"summary_comment" text,
	"inline_comment_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "installation_settings" ADD CONSTRAINT "installation_settings_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "idx_review_jobs_status" ON "review_jobs"("status");
CREATE INDEX "idx_review_jobs_created" ON "review_jobs"("created_at");
