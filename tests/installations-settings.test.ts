import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";

let currentSession: { id: number } | null = null;
let currentHasAccess = true;
let currentQueryResults: unknown[] = [];
let currentUpdateCalls: Record<string, unknown>[] = [];
let currentOpenCodeValidationCalls: Array<{ apiKey: string; model: string }> = [];

function createQueryBuilder(result: unknown) {
  const query = {
    from: () => query,
    where: () => query,
    limit: () => query,
    then: (
      onFulfilled: ((value: unknown) => unknown) | null | undefined,
      onRejected?: ((reason: unknown) => unknown) | null
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected: (reason: unknown) => unknown) =>
      Promise.resolve(result).catch(onRejected),
    finally: (onFinally: (() => void) | undefined) =>
      Promise.resolve(result).finally(onFinally),
  };

  return query;
}

mock.module("../src/api/auth.js", () => ({
  validateSession: async () => currentSession,
}));

mock.module("../src/api/github-installations.js", () => ({
  getAccessToken: () => "test-token",
  userHasInstallationAccess: async () => currentHasAccess,
}));

mock.module("../src/config.js", () => ({
  loadConfig: () => ({
    ENCRYPTION_KEY: "0".repeat(64),
  }),
  getPrivateKey: () => "test-private-key",
}));

mock.module("../src/crypto.js", () => ({
  encrypt: () => ({
    ciphertext: "ciphertext",
    iv: "iv",
    authTag: "authTag",
  }),
  decrypt: () => "decrypted",
}));

mock.module("../src/llm/providers/opencode-client.js", () => ({
  generateOpenCodeText: async (
    apiKey: string,
    model: string
  ) => {
    currentOpenCodeValidationCalls.push({ apiKey, model });
    return { text: "OK", usage: { inputTokens: 1, outputTokens: 1 } };
  },
}));

mock.module("../src/db/index.js", () => ({
  getDb: () => ({
    select: () => {
      if (currentQueryResults.length === 0) {
        throw new Error("Unexpected DB query in installations settings test");
      }

      return createQueryBuilder(currentQueryResults.shift());
    },
    update: () => ({
      set: (data: Record<string, unknown>) => {
        currentUpdateCalls.push(data);
        return {
          where: async () => undefined,
        };
      },
    }),
    insert: () => ({
      values: () => ({
        returning: async () => [],
      }),
    }),
  }),
}));

const { installationsRoutes } = await import("../src/api/installations.js");

describe("installations settings route", () => {
  beforeEach(() => {
    currentSession = { id: 1 };
    currentHasAccess = true;
    currentQueryResults = [];
    currentUpdateCalls = [];
    currentOpenCodeValidationCalls = [];
  });

  test("rejects provider changes without a fresh API key", async () => {
    currentQueryResults = [
      [{ id: 7, githubInstallationId: 123 }],
      [{
        id: 11,
        installationId: 7,
        llmProvider: "openai",
        apiKeyEncrypted: "encrypted",
      }],
    ];

    const app = new Elysia().use(installationsRoutes);
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmProvider: "anthropic",
          llmModel: "claude-sonnet-4-5",
          reviewStyle: "both",
          enabled: true,
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Changing the LLM provider requires a new API key for that provider",
    });
    expect(currentUpdateCalls).toHaveLength(0);
  });

  test("keeps the stored API key when the provider is unchanged", async () => {
    currentQueryResults = [
      [{ id: 7, githubInstallationId: 123 }],
      [{
        id: 11,
        installationId: 7,
        llmProvider: "openai",
        apiKeyEncrypted: "encrypted",
      }],
    ];

    const app = new Elysia().use(installationsRoutes);
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmProvider: "openai",
          llmModel: "gpt-5.4",
          reviewStyle: "summary",
          enabled: true,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "saved" });
    expect(currentUpdateCalls).toHaveLength(1);
    expect(currentUpdateCalls[0]).toMatchObject({
      llmProvider: "openai",
      llmModel: "gpt-5.4",
      reviewStyle: "summary",
      enabled: true,
    });
    expect(currentUpdateCalls[0].apiKeyEncrypted).toBeUndefined();
  });

  test("validates opencode with the selected model when a new API key is provided", async () => {
    currentQueryResults = [
      [{ id: 7, githubInstallationId: 123 }],
      [{
        id: 11,
        installationId: 7,
        llmProvider: "opencode",
        apiKeyEncrypted: null,
      }],
    ];

    const app = new Elysia().use(installationsRoutes);
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmProvider: "opencode",
          llmModel: "minimax-m2.5",
          reviewStyle: "both",
          apiKey: "test-opencode-key",
          enabled: true,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "saved" });
    expect(currentOpenCodeValidationCalls).toEqual([
      { apiKey: "test-opencode-key", model: "minimax-m2.5" },
    ]);
    expect(currentUpdateCalls).toHaveLength(1);
    expect(currentUpdateCalls[0]).toMatchObject({
      llmProvider: "opencode",
      llmModel: "minimax-m2.5",
      reviewStyle: "both",
      enabled: true,
      apiKeyEncrypted: "ciphertext",
    });
  });
});
