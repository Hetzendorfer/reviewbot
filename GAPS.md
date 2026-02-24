# ReviewBot — Open Gaps

## Quick Fixes

1. **`differ.ts:35` — CommonJS `require()` in ESM file**
   `require("minimatch")` should be a top-level `import { minimatch } from "minimatch"`. Works under Bun's compatibility layer but is inconsistent with the rest of the codebase.

2. **Anthropic `max_tokens: 4096` hardcoded** (`src/llm/providers/anthropic.ts`)
   Large diffs could cause truncated LLM responses. Should be configurable or set higher.

3. **Draft PR filtering missing** (`src/github/webhooks.ts`)
   `isPullRequestEvent` does not check `payload.pull_request.draft` for `opened`/`synchronize`/`reopened` actions. Draft PRs will be reviewed unintentionally.

4. **`withRetry` uses `console.log`** (`src/utils/retry.ts:34`)
   Should use the structured `logger` for consistency with the rest of the codebase.

5. **Define correct models for OpenAI and add open-source models** (`src/llm/providers/openai.ts`)
   The OpenAI provider accepts any model string but there is no validation or curated list of recommended models. Should define sensible defaults (e.g. `gpt-5-2`) and add support for open-source models via OpenAI-compatible APIs (e.g. hosted Llama, Mistral, DeepSeek).

6. **Parser fragility** (`src/review/parser.ts`)
   Relies on an exact markdown format from the LLM (`### [SEVERITY] path:line`). If the model deviates, comments are silently dropped with no warning or fallback. Consider logging a warning when the response looks non-empty but yields zero parsed comments, or migrating to structured output (JSON mode).

## Hardening

7. **`filterFiles` untested** (`src/review/differ.ts`)
   The only function in `differ.ts` without test coverage — and it contains the `require()` bug from item 1.

8. **No integration tests**
   Pipeline orchestration, API routes, poster, queue, webhook handler, and auth flow have no test coverage. Only pure utility modules (crypto, differ, parser) are tested.

9. **No secret rotation path**
   If `ENCRYPTION_KEY` is changed, all existing encrypted API keys in the database become unreadable. There is no multi-key support or re-encryption migration.
