import { Elysia } from "elysia";
import { loadConfig } from "../../config.js";
import {
  verifyWebhookSignature,
  isPullRequestEvent,
  type PullRequestEvent,
} from "../../github/webhooks.js";
import { enqueueReview } from "../../review/pipeline.js";

export const githubWebhookHandler = new Elysia().post(
  "/webhooks/github",
  async ({ request, body, set }) => {
    const config = loadConfig();
    const rawBody = JSON.stringify(body);
    const signature = request.headers.get("x-hub-signature-256");
    const event = request.headers.get("x-github-event");

    if (
      !verifyWebhookSignature(rawBody, signature, config.GITHUB_WEBHOOK_SECRET)
    ) {
      set.status = 401;
      return { error: "Invalid signature" };
    }

    if (!event) {
      set.status = 400;
      return { error: "Missing event header" };
    }

    const payload = body as unknown as PullRequestEvent;

    if (isPullRequestEvent(event, payload)) {
      const [owner, repo] = payload.repository.full_name.split("/");
      console.log(
        `PR #${payload.number} ${payload.action} on ${payload.repository.full_name}`
      );

      enqueueReview({
        installationId: payload.installation.id,
        owner,
        repo,
        prNumber: payload.number,
        prTitle: payload.pull_request.title,
        commitSha: payload.pull_request.head.sha,
        baseBranch: payload.pull_request.base.ref,
        repoFullName: payload.repository.full_name,
      });

      return { status: "queued" };
    }

    return { status: "ignored" };
  }
);
