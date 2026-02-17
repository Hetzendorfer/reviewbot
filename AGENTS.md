# AGENTS.md

Coding agent instructions for working in the ReviewBot codebase.

## Project Overview

ReviewBot is a GitHub App that performs automated PR reviews using LLMs. It's built with:
- **Backend**: Bun + TypeScript + Elysia web framework
- **Database**: PostgreSQL with Drizzle ORM
- **Frontend**: Preact + Vite (in `frontend/` directory)
- **LLM Providers**: OpenAI, Anthropic, Google Gemini (pluggable interface)

## Build/Lint/Test Commands

```bash
# Development
bun run dev                  # Start backend with hot reload
bun run dev:frontend         # Start frontend dev server
bun run start                # Start backend without reload

# Build
bun run build:frontend       # Build frontend to frontend/dist

# Database
bun run db:generate          # Generate Drizzle migrations
bun run db:migrate           # Run Drizzle migrations

# Testing
bun test                     # Run all tests
bun test tests/parser.test.ts    # Run single test file
bun test --watch             # Run tests in watch mode

# Type checking (run before committing)
bunx tsc --noEmit            # Type check all TypeScript files
```

## Code Style Guidelines

### Imports

```typescript
// External imports first (alphabetically)
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { z } from "zod";

// Internal imports second (with .js extension for ES modules)
import { loadConfig } from "./config.js";
import { getDb } from "../db/index.js";
import type { ReviewResult } from "../llm/types.js";
```

- Use `.js` extension in import paths (required for ES modules)
- Use `import type` for type-only imports
- Destructure named imports: `import { foo, bar } from "module"`
- Group imports: external first, then internal

### Formatting

- No semicolons (Bun/TypeScript default)
- 2-space indentation
- Single quotes for strings, double quotes only in JSON or when escaping
- No trailing commas in imports/exports
- Max line length ~100 characters

### Types

```typescript
// Interfaces for object shapes
export interface ReviewComment {
  path: string;
  line: number;
  body: string;
  severity: "critical" | "warning" | "suggestion" | "nitpick";
}

// Type aliases for unions, primitives, or complex types
export type Config = z.infer<typeof envSchema>;

// Classes implementing interfaces
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  
  async review(request: ReviewRequest): Promise<ReviewResult> {
    // ...
  }
}
```

- Explicit return types on exported functions
- Use `readonly` for immutable class properties
- Prefer `interface` for object shapes, `type` for unions/aliases
- Use Zod schemas for runtime validation of external data

### Naming Conventions

| Pattern | Usage |
|---------|-------|
| `camelCase` | Variables, functions, methods, properties |
| `PascalCase` | Classes, interfaces, types, enums |
| `SCREAMING_SNAKE_CASE` | Constants (`ALGORITHM`, `IV_LENGTH`) |
| `kebab-case` | File names for non-code (`docker-compose.yml`) |

- File names: match primary export (e.g., `parser.ts` exports `parseReviewResponse`)
- Test files: `<name>.test.ts` in `tests/` directory
- Private class members: no underscore prefix, rely on TypeScript's `private`

### Error Handling

```typescript
// Log errors with context
console.error(`Review error for ${repoFullName}#${prNumber}:`, errorMessage);

// Return early for validation failures
if (!installation) {
  console.warn(`Unknown installation: ${installationId}`);
  return;
}

// Wrap unknown errors
catch (err) {
  const errorMessage = err instanceof Error ? err.message : String(err);
  // handle error
}

// For API responses, return error objects
set.status = 404;
return { error: "Installation not found" };
```

- Use `instanceof Error` check when catching
- Log errors with relevant context (repo, PR number, installation ID)
- Return early for guard clauses
- Don't throw in async handlers; log and return/set status

### Async Patterns

```typescript
// Async functions with explicit return types
async function processReview(job: ReviewJob): Promise<void> {
  const result = await provider.review(request);
}

// Promise constructor for callback-based APIs
return new Promise((resolve, reject) => {
  this.queue.push({ data, resolve, reject });
});
```

- Always use `async/await` over raw promises
- Use `Promise<T>` for return types of async functions

### Database Operations

```typescript
// SELECT with limit
const [installation] = await db
  .select()
  .from(installations)
  .where(eq(installations.githubInstallationId, installationId))
  .limit(1);

// INSERT with returning
const [review] = await db
  .insert(reviews)
  .values({ /* ... */ })
  .returning();

// UPDATE with where
await db
  .update(reviews)
  .set({ status: "completed" })
  .where(eq(reviews.id, review.id));
```

- Use Drizzle ORM, not raw SQL
- Destructure array result for single records
- Always use `.limit(1)` for single-record queries

### Testing Patterns

```typescript
import { describe, test, expect } from "bun:test";

describe("parseReviewResponse", () => {
  test("parses summary and comments", () => {
    const result = parseReviewResponse(raw);
    expect(result.summary).toBe("Expected text");
    expect(result.comments).toHaveLength(2);
  });

  test("handles empty input gracefully", () => {
    const result = parseReviewResponse("");
    expect(result.comments).toEqual([]);
  });
});
```

- Use Bun's built-in test framework (`bun:test`)
- Group related tests in `describe` blocks
- Test edge cases: empty input, malformed data, errors
- Keep tests focused on one assertion concept each

### Security

- Never log or expose API keys or secrets
- API keys stored encrypted using AES-256-GCM
- Use environment variables for all secrets (see `.env.example`)
- Validate env vars at startup with Zod schema

## Project Structure

```
src/
├── api/
│   ├── settings.ts          # REST API for installation settings
│   └── webhooks/github.ts   # GitHub webhook handler
├── db/
│   ├── index.ts             # Database connection
│   └── schema.ts            # Drizzle schema definitions
├── github/
│   ├── auth.ts              # GitHub App JWT authentication
│   ├── client.ts            # Octokit wrapper functions
│   └── webhooks.ts          # Webhook event routing
├── llm/
│   ├── providers/           # OpenAI, Anthropic, Gemini implementations
│   ├── prompts.ts           # System/user prompt templates
│   ├── registry.ts          # Provider registration
│   └── types.ts             # LLM interfaces
├── review/
│   ├── differ.ts            # Diff parsing and chunking
│   ├── parser.ts            # LLM response parsing
│   ├── pipeline.ts          # Main review orchestration
│   └── poster.ts            # GitHub review posting
├── config.ts                # Zod-validated environment config
├── crypto.ts                # AES encryption utilities
├── index.ts                 # App entry point (Elysia server)
├── queue.ts                 # Async job queue
└── repo-config.ts           # .reviewbot.yml loading

tests/                       # Test files (mirror src structure)
frontend/                    # Preact frontend
```

## Key Patterns

### LLM Provider Interface

```typescript
interface LLMProvider {
  readonly name: string;
  review(request: ReviewRequest, apiKey: string, model: string): Promise<ReviewResult>;
}
```

New providers implement this interface and register in `src/llm/registry.ts`.

### Review Pipeline Flow

1. Webhook receives PR event → `enqueueReview()`
2. Async queue processes with concurrency=3
3. Fetch diff → parse → filter → chunk
4. Call LLM provider with prompts
5. Parse structured response
6. Post review comments to GitHub

### Configuration Hierarchy

1. Database settings (per-installation)
2. Repo config file (`.reviewbot.yml`)
3. Merged via `mergeConfig()` in `repo-config.ts`
