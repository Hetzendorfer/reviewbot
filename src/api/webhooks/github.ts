import { Elysia } from "elysia";
import { loadConfig } from "../../config.js";
import {
  verifyWebhookSignature,
  isPullRequestEvent,
  isReviewRequestCommentEvent,
  type PullRequestEvent,
  type IssueCommentEvent,
} from "../../github/webhooks.js";
import { enqueueReview, QueueNotReadyError } from "../../review/pipeline.js";
import { recordWebhookTrace } from "../../observability/webhook-traces.js";
import { logger } from "../../logger.js";
import {
  addEyesReactionToIssueComment,
  fetchPullRequestMetadata,
  getOctokit,
} from "../../github/client.js";

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
  isReviewRequestCommentEventFn?: typeof isReviewRequestCommentEvent;
  getOctokitFn?: typeof getOctokit;
  fetchPullRequestMetadataFn?: typeof fetchPullRequestMetadata;
  reactToIssueCommentFn?: typeof addEyesReactionToIssueComment;
  loggerInstance?: typeof logger;
  loadConfigFn?: () => Pick<
    ReturnType<typeof loadConfig>,
    "GITHUB_WEBHOOK_SECRET" | "GITHUB_APP_SLUG"
  >;
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

function hasReviewableCommentPayload(
  payload: Partial<IssueCommentEvent>
): payload is IssueCommentEvent {
  return Boolean(
    payload.repository?.full_name &&
      payload.issue?.number &&
      payload.issue?.pull_request &&
      payload.installation?.id &&
      payload.comment?.id &&
      payload.comment?.body
  );
}

export async function handleGitHubWebhook(
  { body, set, request }: WebhookContext,
  {
    enqueueReviewFn = enqueueReview,
    isPullRequestEventFn = isPullRequestEvent,
    isReviewRequestCommentEventFn = isReviewRequestCommentEvent,
    getOctokitFn = getOctokit,
    fetchPullRequestMetadataFn = fetchPullRequestMetadata,
    reactToIssueCommentFn = addEyesReactionToIssueComment,
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
  const deliveryId = request.headers.get("x-github-delivery");

  if (!verifyWebhookSignatureFn(rawBody, signature, config.GITHUB_WEBHOOK_SECRET)) {
    recordWebhookTrace({
      deliveryId,
      event,
      stage: "rejected_invalid_signature",
      detail: "GitHub webhook signature verification failed",
      ok: false,
    });
    loggerInstance.warn("Invalid webhook signature");
    set.status = 401;
    return { error: "Invalid signature" };
  }

  if (!event) {
    set.status = 400;
    return { error: "Missing event header" };
  }

  let payload: Partial<PullRequestEvent & IssueCommentEvent>;
  try {
    payload = JSON.parse(rawBody) as Partial<PullRequestEvent>;
  } catch {
    recordWebhookTrace({
      deliveryId,
      event,
      stage: "rejected_invalid_json",
      detail: "Webhook body was not valid JSON",
      ok: false,
    });
    set.status = 400;
    return { error: "Invalid JSON payload" };
  }

  recordWebhookTrace({
    deliveryId,
    event,
    action: payload.action ?? null,
    repoFullName: payload.repository?.full_name ?? null,
    installationId: payload.installation?.id ?? null,
    prNumber: "number" in payload && typeof payload.number === "number"
      ? payload.number
      : payload.issue?.number ?? null,
    stage: "received",
    detail: "Deployment received webhook request",
  });

  loggerInstance.info("Webhook received", {
    event,
    repo: payload.repository?.full_name,
    action: payload.action,
  });

  if (isPullRequestEventFn(event, payload as PullRequestEvent)) {
    if (!hasReviewablePullRequestPayload(payload)) {
      recordWebhookTrace({
        deliveryId,
        event,
        action: payload.action ?? null,
        repoFullName: payload.repository?.full_name ?? null,
        installationId: payload.installation?.id ?? null,
        prNumber: payload.number ?? null,
        stage: "rejected_invalid_payload",
        detail: "pull_request payload missing required fields",
        ok: false,
      });
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
        recordWebhookTrace({
          deliveryId,
          event,
          action: payload.action,
          repoFullName: payload.repository.full_name,
          installationId: payload.installation.id,
          prNumber: payload.number,
          stage: "queue_unavailable",
          detail: "Webhook accepted but review queue was not ready",
          ok: false,
        });
        loggerInstance.warn("Webhook rejected because review queue is not ready", {
          installationId: payload.installation.id,
          repo: payload.repository.full_name,
          pr: payload.number,
        });
        set.status = 503;
        return { error: "Review queue unavailable" };
      }

      recordWebhookTrace({
        deliveryId,
        event,
        action: payload.action,
        repoFullName: payload.repository.full_name,
        installationId: payload.installation.id,
        prNumber: payload.number,
        stage: "enqueue_failed",
        detail: err instanceof Error ? err.message : String(err),
        ok: false,
      });
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

    recordWebhookTrace({
      deliveryId,
      event,
      action: payload.action,
      repoFullName: payload.repository.full_name,
      installationId: payload.installation.id,
      prNumber: payload.number,
      stage: "queued",
      detail: "Review job accepted into queue",
    });

    return { status: "queued" };
  }

  if (
    isReviewRequestCommentEventFn(
      event,
      payload as IssueCommentEvent,
      config.GITHUB_APP_SLUG
    )
  ) {
    if (!hasReviewableCommentPayload(payload)) {
      recordWebhookTrace({
        deliveryId,
        event,
        action: payload.action ?? null,
        repoFullName: payload.repository?.full_name ?? null,
        installationId: payload.installation?.id ?? null,
        prNumber: payload.issue?.number ?? null,
        stage: "rejected_invalid_payload",
        detail: "issue_comment payload missing required fields",
        ok: false,
      });
      set.status = 400;
      return { error: "Invalid webhook payload" };
    }

    const [owner, repo] = payload.repository.full_name.split("/");

    try {
      const octokit = await getOctokitFn(payload.installation.id);
      const pullRequest = await fetchPullRequestMetadataFn(
        octokit,
        owner,
        repo,
        payload.issue.number
      );

      await enqueueReviewFn({
        installationId: payload.installation.id,
        owner,
        repo,
        prNumber: payload.issue.number,
        prTitle: pullRequest.title,
        commitSha: pullRequest.headSha,
        baseBranch: pullRequest.baseBranch,
        repoFullName: payload.repository.full_name,
      });
    } catch (err) {
      if (
        err instanceof QueueNotReadyError ||
        (err instanceof Error && err.name === "QueueNotReadyError")
      ) {
        recordWebhookTrace({
          deliveryId,
          event,
          action: payload.action,
          repoFullName: payload.repository.full_name,
          installationId: payload.installation.id,
          prNumber: payload.issue.number,
          stage: "queue_unavailable",
          detail: "Mention-triggered review reached webhook but queue was not ready",
          ok: false,
        });
        loggerInstance.warn("Mention-triggered review rejected because queue is not ready", {
          installationId: payload.installation.id,
          repo: payload.repository.full_name,
          pr: payload.issue.number,
        });
        set.status = 503;
        return { error: "Review queue unavailable" };
      }

      recordWebhookTrace({
        deliveryId,
        event,
        action: payload.action,
        repoFullName: payload.repository.full_name,
        installationId: payload.installation.id,
        prNumber: payload.issue.number,
        stage: "enqueue_failed",
        detail: err instanceof Error ? err.message : String(err),
        ok: false,
      });
      loggerInstance.error("Failed to enqueue mention-triggered review", {
        installationId: payload.installation.id,
        repo: payload.repository.full_name,
        pr: payload.issue.number,
        error: String(err),
      });
      set.status = 500;
      return { error: "Failed to queue review" };
    }

    loggerInstance.info("Mention-triggered review queued", {
      installationId: payload.installation.id,
      repo: payload.repository.full_name,
      pr: payload.issue.number,
    });

    recordWebhookTrace({
      deliveryId,
      event,
      action: payload.action,
      repoFullName: payload.repository.full_name,
      installationId: payload.installation.id,
      prNumber: payload.issue.number,
      stage: "queued",
      detail: "Mention-triggered review job accepted into queue",
    });

    try {
      const octokit = await getOctokitFn(payload.installation.id);
      await reactToIssueCommentFn(
        octokit,
        owner,
        repo,
        payload.comment.id
      );
      recordWebhookTrace({
        deliveryId,
        event,
        action: payload.action,
        repoFullName: payload.repository.full_name,
        installationId: payload.installation.id,
        prNumber: payload.issue.number,
        stage: "reaction_added",
        detail: "Added 👀 reaction to review request comment",
      });
    } catch (err) {
      recordWebhookTrace({
        deliveryId,
        event,
        action: payload.action,
        repoFullName: payload.repository.full_name,
        installationId: payload.installation.id,
        prNumber: payload.issue.number,
        stage: "reaction_failed",
        detail: err instanceof Error ? err.message : String(err),
        ok: false,
      });
      loggerInstance.warn("Failed to add eyes reaction to review request comment", {
        installationId: payload.installation.id,
        repo: payload.repository.full_name,
        pr: payload.issue.number,
        error: String(err),
      });
    }

    return { status: "queued" };
  }

  recordWebhookTrace({
    deliveryId,
    event,
    action: payload.action ?? null,
    repoFullName: payload.repository?.full_name ?? null,
    installationId: payload.installation?.id ?? null,
    prNumber: payload.issue?.number ?? payload.number ?? null,
    stage: "ignored",
    detail: "Webhook did not match a configured review trigger",
  });

  return { status: "ignored" };
}

export const githubWebhookHandler = new Elysia().post(
  "/webhooks/github",
  (context) => handleGitHubWebhook(context),
  {
    parse: "text",
  }
);
