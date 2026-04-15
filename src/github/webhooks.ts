import { createHmac, timingSafeEqual } from "crypto";

export function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  const expected = `sha256=${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  if (expected.length !== signature.length) return false;

  return timingSafeEqual(
    Buffer.from(signature, "utf-8"),
    Buffer.from(expected, "utf-8")
  );
}

export interface PullRequestEvent {
  action: string;
  number: number;
  pull_request: {
    title: string;
    head: { sha: string };
    base: { ref: string };
    diff_url: string;
    draft?: boolean;
  };
  repository: {
    full_name: string;
    default_branch: string;
  };
  installation: {
    id: number;
  };
}

export interface IssueCommentEvent {
  action: string;
  issue: {
    number: number;
    pull_request?: {
      url: string;
    };
  };
  comment: {
    id: number;
    body: string;
    user?: {
      type?: string;
    };
  };
  repository: {
    full_name: string;
  };
  installation: {
    id: number;
  };
}

export function isPullRequestEvent(
  event: string,
  payload: PullRequestEvent
): boolean {
  if (event !== "pull_request") return false;

  const validActions = [
    "opened",
    "synchronize",
    "reopened",
    "ready_for_review",
  ];

  if (!validActions.includes(payload.action)) return false;

  const draftActions = ["opened", "synchronize", "reopened"];
  if (payload.pull_request.draft && draftActions.includes(payload.action)) {
    return false;
  }

  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function hasReviewRequestMention(
  body: string,
  appSlug = "reviewbot"
): boolean {
  return new RegExp(`(?:^|\\s)@${escapeRegExp(appSlug)}\\s+review\\b`, "i").test(body);
}

export function isReviewRequestCommentEvent(
  event: string,
  payload: IssueCommentEvent,
  appSlug = "reviewbot"
): boolean {
  if (event !== "issue_comment") return false;
  if (payload.action !== "created") return false;
  if (!payload.issue.pull_request) return false;
  if ((payload.comment.user?.type ?? "").toLowerCase() === "bot") return false;

  return hasReviewRequestMention(payload.comment.body, appSlug);
}
