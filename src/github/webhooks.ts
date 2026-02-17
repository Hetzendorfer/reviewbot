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

  return validActions.includes(payload.action);
}
