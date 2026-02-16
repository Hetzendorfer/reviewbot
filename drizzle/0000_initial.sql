DO $$ BEGIN
  CREATE TYPE "llm_provider" AS ENUM ('openai', 'anthropic', 'gemini');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "review_style" AS ENUM ('inline', 'summary', 'both');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "review_status" AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "installations" (
  "id" serial PRIMARY KEY NOT NULL,
  "github_installation_id" integer NOT NULL UNIQUE,
  "github_account_login" text NOT NULL,
  "github_account_type" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "installation_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "installation_id" integer NOT NULL UNIQUE REFERENCES "installations"("id"),
  "llm_provider" "llm_provider" DEFAULT 'openai' NOT NULL,
  "llm_model" text DEFAULT 'gpt-4o' NOT NULL,
  "review_style" "review_style" DEFAULT 'both' NOT NULL,
  "api_key_encrypted" text,
  "api_key_iv" text,
  "api_key_auth_tag" text,
  "ignore_paths" text[] DEFAULT ARRAY['.lock', '*.min.js', '*.min.css'] NOT NULL,
  "custom_instructions" text,
  "max_files_per_review" integer DEFAULT 20 NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "reviews" (
  "id" serial PRIMARY KEY NOT NULL,
  "installation_id" integer NOT NULL REFERENCES "installations"("id"),
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
