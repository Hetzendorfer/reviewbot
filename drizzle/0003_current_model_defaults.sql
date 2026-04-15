ALTER TYPE "public"."llm_provider" ADD VALUE IF NOT EXISTS 'opencode';

ALTER TABLE "installation_settings"
ALTER COLUMN "llm_model" SET DEFAULT 'gpt-5.4';

UPDATE "installation_settings"
SET "llm_model" = CASE
  WHEN "llm_provider" = 'openai' THEN 'gpt-5.4'
  WHEN "llm_provider" = 'anthropic' THEN 'claude-sonnet-4-5'
  WHEN "llm_provider" = 'gemini' THEN 'gemini-2.5-pro'
  WHEN "llm_provider" = 'opencode' THEN 'glm-5'
  ELSE "llm_model"
END
WHERE
  ("llm_provider" = 'openai' AND "llm_model" <> 'gpt-5.4')
  OR ("llm_provider" = 'anthropic' AND "llm_model" <> 'claude-sonnet-4-5')
  OR ("llm_provider" = 'gemini' AND "llm_model" <> 'gemini-2.5-pro')
  OR ("llm_provider" = 'opencode' AND "llm_model" <> 'glm-5');
