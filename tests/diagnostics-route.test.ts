import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";

let currentSession: { id: number } | null = null;
let currentHasAccess = true;
let currentInstallation: { id: number } | null = null;
let currentQueryResults: unknown[] = [];
let currentQueueStats = { pending: 0, processing: 0, failed: 0 };
let currentWebhookTraces: unknown[] = [];

function createQueryBuilder(result: unknown) {
  const query = {
    from: () => query,
    where: () => query,
    orderBy: () => query,
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
  authRoutes: new Elysia({ prefix: "/api/auth" }),
  validateSession: async () => currentSession,
}));

mock.module("../src/api/github-installations.js", () => ({
  getAccessToken: () => "test-token",
  getInstallationByGithubId: async () => currentInstallation,
  userHasInstallationAccess: async () => currentHasAccess,
}));

mock.module("../src/db/index.js", () => ({
  getDb: () => ({
    select: () => {
      if (currentQueryResults.length === 0) {
        throw new Error("Unexpected DB query in diagnostics test");
      }

      return createQueryBuilder(currentQueryResults.shift());
    },
  }),
}));

mock.module("../src/review/pipeline.js", () => ({
  QueueNotReadyError: class QueueNotReadyError extends Error {
    constructor(message = "Review queue is not ready") {
      super(message);
      this.name = "QueueNotReadyError";
    }
  },
  enqueueReview: async () => undefined,
  getQueueStats: async () => currentQueueStats,
  isQueueReady: () => true,
  startQueue: async () => undefined,
  stopQueue: async () => undefined,
}));

mock.module("../src/observability/webhook-traces.js", () => ({
  clearWebhookTraces: () => undefined,
  listWebhookTraces: () => currentWebhookTraces,
  recordWebhookTrace: () => undefined,
}));

mock.module("../src/config.js", () => ({
  loadConfig: () => ({
    GITHUB_APP_ID: "123",
    GITHUB_APP_SLUG: "reviewbot",
    GITHUB_PRIVATE_KEY: "base64-private-key",
    GITHUB_WEBHOOK_SECRET: "webhook-secret",
    GITHUB_CLIENT_ID: "client-id",
    GITHUB_CLIENT_SECRET: "client-secret",
    METRICS_TOKEN: "metrics-token",
    DATABASE_URL: "https://example.com/db",
    ENCRYPTION_KEY: "0".repeat(64),
    SESSION_SECRET: "x".repeat(32),
    BASE_URL: "https://reviewbot.example.com",
    PORT: 3000,
    HOST: "0.0.0.0",
    LOG_LEVEL: "info",
  }),
  getPrivateKey: () => "test-private-key",
}));

const { diagnosticsRoutes } = await import("../src/api/diagnostics.js");

describe("diagnosticsRoutes", () => {
  beforeEach(() => {
    currentSession = null;
    currentHasAccess = true;
    currentInstallation = null;
    currentQueryResults = [];
    currentQueueStats = { pending: 0, processing: 0, failed: 0 };
    currentWebhookTraces = [];
  });

  test("returns 401 without a valid session", async () => {
    const app = new Elysia().use(diagnosticsRoutes);
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/diagnostics")
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not authenticated" });
  });

  test("returns 403 when the user lacks installation access", async () => {
    currentSession = { id: 1 };
    currentHasAccess = false;

    const app = new Elysia().use(diagnosticsRoutes);
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/diagnostics")
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Access denied" });
  });

  test("returns installation diagnostics with traces and job history", async () => {
    currentSession = { id: 1 };
    currentInstallation = { id: 7 };
    currentQueueStats = { pending: 2, processing: 1, failed: 3 };
    currentWebhookTraces = [
      {
        id: "trace-1",
        timestamp: "2026-04-15T11:30:00.000Z",
        deliveryId: "delivery-1",
        event: "pull_request",
        action: "opened",
        repoFullName: "acme/reviewbot",
        installationId: 123,
        prNumber: 42,
        stage: "queued",
        detail: "Review job accepted into queue",
        ok: true,
      },
    ];
    currentQueryResults = [
      [
        {
          enabled: true,
          hasApiKey: "encrypted",
          provider: "openai",
          model: "gpt-5.4",
        },
      ],
      [
        {
          id: 11,
          repoFullName: "acme/reviewbot",
          prNumber: 42,
          status: "processing",
          errorMessage: null,
          createdAt: new Date("2026-04-15T11:29:00.000Z"),
          startedAt: new Date("2026-04-15T11:29:05.000Z"),
          completedAt: null,
        },
      ],
      [
        {
          id: 17,
          repoFullName: "acme/reviewbot",
          prNumber: 42,
          status: "completed",
          errorMessage: null,
          inlineCommentCount: 2,
          createdAt: new Date("2026-04-15T11:28:00.000Z"),
        },
      ],
    ];

    const app = new Elysia().use(diagnosticsRoutes);
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/diagnostics")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      appSlug: "reviewbot",
      triggerPhrase: "@reviewbot review 👀",
      webhookEndpoint: "https://reviewbot.example.com/webhooks/github",
      queue: {
        pending: 2,
        processing: 1,
        failed: 3,
      },
      installation: {
        existsLocally: true,
        enabled: true,
        hasApiKey: true,
        provider: "openai",
        model: "gpt-5.4",
      },
      recentWebhookTraces: currentWebhookTraces,
      recentJobs: [
        {
          id: 11,
          repoFullName: "acme/reviewbot",
          prNumber: 42,
          status: "processing",
          errorMessage: null,
          createdAt: "2026-04-15T11:29:00.000Z",
          startedAt: "2026-04-15T11:29:05.000Z",
          completedAt: null,
        },
      ],
      recentReviews: [
        {
          id: 17,
          repoFullName: "acme/reviewbot",
          prNumber: 42,
          status: "completed",
          errorMessage: null,
          inlineCommentCount: 2,
          createdAt: "2026-04-15T11:28:00.000Z",
        },
      ],
    });
  });
});
