import { Elysia } from "elysia";
import { loadConfig } from "../../config.js";
import {
  verifyWebhookSignature,
  isPullRequestEvent,
  type PullRequestEvent,
} from "../../github/webhooks.js";
import { enqueueReview, QueueNotReadyError } from "../../review/pipeline.js";
import { logger } from "../../logger.js";

type WebhookContext = {
  body: unknown;
  request: Request;
  set: {
    status?: number | string;
  };
};

type WebhookDependencies = {
  enqueueReviewFn?: typeof enqueueReview;
  isPullRequestEventFn?: typeof isPullRequestEvent;
  loggerInstance?: typeof logger;
  loadConfigFn?: () => Pick<ReturnType<typeof loadConfig>, "GITHUB_WEBHOOK_SECRET">;
  verifyWebhookSignatureFn?: typeof verifyWebhookSignature;
};

function hasReviewablePullRequestPayload(
  payload: Partial<PullRequestEvent>
): payload is PullRequestEvent {
  return Boolean(
    payload.repository?.full_name &&
      payload.pull_request?.title &&
      payload.pull_request?.head?.sha &&
      payload.pull_request?.base?.ref &&
      payload.installation?.id
  );
}

export async function handleGitHubWebhook(
  { body, set, request }: WebhookContext,
  {
    enqueueReviewFn = enqueueReview,
    isPullRequestEventFn = isPullRequestEvent,
    loggerInstance = logger,
    loadConfigFn = () => loadConfig(),
    verifyWebhookSignatureFn = verifyWebhookSignature,
  }: WebhookDependencies = {}
) {
  const config = loadConfigFn();
  const rawBody =
    typeof body === "string"
      ? body
      : body == null
        ? ""
        : JSON.stringify(body);
  const signature = request.headers.get("x-hub-signature-256");
  const event = request.headers.get("x-github-event");

  if (!verifyWebhookSignatureFn(rawBody, signature, config.GITHUB_WEBHOOK_SECRET)) {
    loggerInstance.warn("Invalid webhook signature");
    set.status = 401;
    return { error: "Invalid signature" };
  }

  if (!event) {
    set.status = 400;
    return { error: "Missing event header" };
  }

  let payload: Partial<PullRequestEvent>;
  try {
    payload = JSON.parse(rawBody) as Partial<PullRequestEvent>;
  } catch {
    set.status = 400;
    return { error: "Invalid JSON payload" };
  }

  loggerInstance.info("Webhook received", {
    event,
    repo: payload.repository?.full_name,
    action: payload.action,
  });

  if (isPullRequestEventFn(event, payload as PullRequestEvent)) {
    if (!hasReviewablePullRequestPayload(payload)) {
      set.status = 400;
      return { error: "Invalid webhook payload" };
    }

    const [owner, repo] = payload.repository.full_name.split("/");

    try {
      await enqueueReviewFn({
        installationId: payload.installation.id,
        owner,
        repo,
        prNumber: payload.number,
        prTitle: payload.pull_request.title,
        commitSha: payload.pull_request.head.sha,
        baseBranch: payload.pull_request.base.ref,
        repoFullName: payload.repository.full_name,
      });
    } catch (err) {
      if (
        err instanceof QueueNotReadyError ||
        (err instanceof Error && err.name === "QueueNotReadyError")
      ) {
        loggerInstance.warn("Webhook rejected because review queue is not ready", {
          installationId: payload.installation.id,
          repo: payload.repository.full_name,
          pr: payload.number,
        });
        set.status = 503;
        return { error: "Review queue unavailable" };
      }

      loggerInstance.error("Failed to enqueue review", {
        installationId: payload.installation.id,
        repo: payload.repository.full_name,
        pr: payload.number,
        error: String(err),
      });
      set.status = 500;
      return { error: "Failed to queue review" };
    }

    loggerInstance.info("Review queued", {
      installationId: payload.installation.id,
      repo: payload.repository.full_name,
      pr: payload.number,
    });

    return { status: "queued" };
  }

  return { status: "ignored" };
}

export const githubWebhookHandler = new Elysia().post(
  "/webhooks/github",
  (context) => handleGitHubWebhook(context),
  {
    parse: "text",
  }
);
