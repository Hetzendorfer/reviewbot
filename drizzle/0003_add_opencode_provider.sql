ALTER TYPE "public"."llm_provider" ADD VALUE IF NOT EXISTS 'opencode';

ALTER TABLE "installation_settings"
ALTER COLUMN "llm_model" SET DEFAULT 'gpt-5.4';
