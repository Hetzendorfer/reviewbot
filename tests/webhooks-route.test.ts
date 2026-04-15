import { beforeEach, describe, expect, test } from "bun:test";

let currentEnqueueError: Error | null = null;

const { handleGitHubWebhook } = await import("../src/api/webhooks/github.js");
const { QueueNotReadyError } = await import("../src/review/pipeline.js");

const testLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function buildWebhookContext() {
  const rawBody = JSON.stringify({
    action: "opened",
    number: 42,
    pull_request: {
      title: "Harden webhook startup",
      head: { sha: "abc123" },
      base: { ref: "main" },
    },
    repository: {
      full_name: "acme/reviewbot",
    },
    installation: {
      id: 99,
    },
  });

  return {
    body: rawBody,
    request: new Request("http://localhost/webhooks/github", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "x-hub-signature-256": "sha256=test",
        "x-github-event": "pull_request",
      },
      body: rawBody,
    }),
    set: {
      status: undefined as number | string | undefined,
    },
  };
}

function buildNonPullRequestWebhookContext() {
  const rawBody = JSON.stringify({
    zen: "Keep it logically awesome.",
    hook_id: 123,
  });

  return {
    body: rawBody,
    request: new Request("http://localhost/webhooks/github", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "x-hub-signature-256": "sha256=test",
        "x-github-event": "ping",
      },
      body: rawBody,
    }),
    set: {
      status: undefined as number | string | undefined,
    },
  };
}

function buildMentionWebhookContext(body = "@reviewbot review") {
  const rawBody = JSON.stringify({
    action: "created",
    issue: {
      number: 42,
      pull_request: {
        url: "https://api.github.com/repos/acme/reviewbot/pulls/42",
      },
    },
    comment: {
      body,
      user: {
        type: "User",
      },
    },
    repository: {
      full_name: "acme/reviewbot",
    },
    installation: {
      id: 99,
    },
  });

  return {
    body: rawBody,
    request: new Request("http://localhost/webhooks/github", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "x-hub-signature-256": "sha256=test",
        "x-github-event": "issue_comment",
      },
      body: rawBody,
    }),
    set: {
      status: undefined as number | string | undefined,
    },
  };
}

function loadWebhookConfig() {
  return {
    GITHUB_WEBHOOK_SECRET: "webhook-secret",
    GITHUB_APP_SLUG: "reviewbot",
  };
}

describe("github webhook route", () => {
  beforeEach(() => {
    currentEnqueueError = null;
  });

  test("returns 503 when the review queue is not ready", async () => {
    currentEnqueueError = new QueueNotReadyError();

    const context = buildWebhookContext();
    const response = await handleGitHubWebhook(context, {
      enqueueReviewFn: async () => {
        if (currentEnqueueError) {
          throw currentEnqueueError;
        }
      },
      isPullRequestEventFn: () => true,
      loggerInstance: testLogger as never,
      loadConfigFn: loadWebhookConfig,
      verifyWebhookSignatureFn: () => true,
    });

    expect(context.set.status).toBe(503);
    expect(response).toEqual({ error: "Review queue unavailable" });
  });

  test("returns queued only after the job is accepted", async () => {
    const context = buildWebhookContext();
    const response = await handleGitHubWebhook(context, {
      enqueueReviewFn: async () => {
        if (currentEnqueueError) {
          throw currentEnqueueError;
        }
      },
      isPullRequestEventFn: () => true,
      loggerInstance: testLogger as never,
      loadConfigFn: loadWebhookConfig,
      verifyWebhookSignatureFn: () => true,
    });

    expect(context.set.status).toBeUndefined();
    expect(response).toEqual({ status: "queued" });
  });

  test("ignores non pull_request events without requiring PR payload fields", async () => {
    const context = buildNonPullRequestWebhookContext();
    const response = await handleGitHubWebhook(context, {
      enqueueReviewFn: async () => {
        throw new Error("enqueueReview should not be called for ignored events");
      },
      isPullRequestEventFn: () => false,
      loggerInstance: testLogger as never,
      loadConfigFn: loadWebhookConfig,
      verifyWebhookSignatureFn: () => true,
    });

    expect(context.set.status).toBeUndefined();
    expect(response).toEqual({ status: "ignored" });
  });

  test("queues a review when directly mentioned on a pull request comment", async () => {
    const context = buildMentionWebhookContext();
    const response = await handleGitHubWebhook(context, {
      enqueueReviewFn: async () => {
        if (currentEnqueueError) {
          throw currentEnqueueError;
        }
      },
      isPullRequestEventFn: () => false,
      isReviewRequestCommentEventFn: () => true,
      getOctokitFn: async () => ({}) as never,
      fetchPullRequestMetadataFn: async () => ({
        title: "Harden webhook startup",
        headSha: "abc123",
        baseBranch: "main",
      }),
      loggerInstance: testLogger as never,
      loadConfigFn: loadWebhookConfig,
      verifyWebhookSignatureFn: () => true,
    });

    expect(context.set.status).toBeUndefined();
    expect(response).toEqual({ status: "queued" });
  });

  test("returns 503 when a mention-triggered review cannot enter the queue", async () => {
    currentEnqueueError = new QueueNotReadyError();

    const context = buildMentionWebhookContext();
    const response = await handleGitHubWebhook(context, {
      enqueueReviewFn: async () => {
        if (currentEnqueueError) {
          throw currentEnqueueError;
        }
      },
      isPullRequestEventFn: () => false,
      isReviewRequestCommentEventFn: () => true,
      getOctokitFn: async () => ({}) as never,
      fetchPullRequestMetadataFn: async () => ({
        title: "Harden webhook startup",
        headSha: "abc123",
        baseBranch: "main",
      }),
      loggerInstance: testLogger as never,
      loadConfigFn: loadWebhookConfig,
      verifyWebhookSignatureFn: () => true,
    });

    expect(context.set.status).toBe(503);
    expect(response).toEqual({ error: "Review queue unavailable" });
  });
});
