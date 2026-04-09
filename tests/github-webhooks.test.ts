import { describe, expect, test } from "bun:test";
import { isPullRequestEvent, type PullRequestEvent } from "../src/github/webhooks.js";

function makePayload(
  action: PullRequestEvent["action"] = "opened",
  draft = false
): PullRequestEvent {
  return {
    action,
    number: 1,
    pull_request: {
      title: "Update docs",
      head: { sha: "abc123" },
      base: { ref: "main" },
      diff_url: "https://example.com/diff",
      draft,
    },
    repository: {
      full_name: "acme/reviewbot",
      default_branch: "main",
    },
    installation: {
      id: 42,
    },
  };
}

describe("isPullRequestEvent", () => {
  test("accepts ready pull request events", () => {
    expect(isPullRequestEvent("pull_request", makePayload())).toBe(true);
    expect(
      isPullRequestEvent("pull_request", makePayload("ready_for_review", true))
    ).toBe(true);
  });

  test("rejects draft pull request events until they are ready", () => {
    expect(isPullRequestEvent("pull_request", makePayload("opened", true))).toBe(
      false
    );
    expect(
      isPullRequestEvent("pull_request", makePayload("synchronize", true))
    ).toBe(false);
  });

  test("rejects non pull_request events", () => {
    expect(isPullRequestEvent("push", makePayload())).toBe(false);
  });
});
