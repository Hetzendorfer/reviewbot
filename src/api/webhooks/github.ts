import { Elysia } from "elysia";
import { loadConfig } from "../../config.js";
import {
  verifyWebhookSignature,
  isPullRequestEvent,
  type PullRequestEvent,
} from "../../github/webhooks.js";
import { enqueueReview } from "../../review/pipeline.js";
import { logger } from "../../logger.js";

export const githubWebhookHandler = new Elysia().post(
  "/webhooks/github",
  async ({ body, set, request }) => {
    const config = loadConfig();
    const rawBody = body as string;
    const signature = request.headers.get("x-hub-signature-256");
    const event = request.headers.get("x-github-event");

    if (
      !verifyWebhookSignature(rawBody, signature, config.GITHUB_WEBHOOK_SECRET)
    ) {
      logger.warn("Invalid webhook signature");
      set.status = 401;
      return { error: "Invalid signature" };
    }

    if (!event) {
      set.status = 400;
      return { error: "Missing event header" };
    }

    let payload: PullRequestEvent;
    try {
      payload = JSON.parse(rawBody) as PullRequestEvent;
    } catch {
      set.status = 400;
      return { error: "Invalid JSON payload" };
    }

    logger.info("Webhook received", {
      event,
      repo: payload.repository?.full_name,
      action: payload.action,
    });

    if (isPullRequestEvent(event, payload)) {
      const [owner, repo] = payload.repository.full_name.split("/");

      await enqueueReview({
        installationId: payload.installation.id,
        owner,
        repo,
        prNumber: payload.number,
        prTitle: payload.pull_request.title,
        commitSha: payload.pull_request.head.sha,
        baseBranch: payload.pull_request.base.ref,
        repoFullName: payload.repository.full_name,
      });

      logger.info("Review queued", {
        installationId: payload.installation.id,
        repo: payload.repository.full_name,
        pr: payload.number,
      });

      return { status: "queued" };
    }

    return { status: "ignored" };
  },
  {
    parse: "text",
  }
);
