import { describe, expect, test } from "bun:test";
import {
  hasReviewRequestMention,
  isPullRequestEvent,
  isReviewRequestCommentEvent,
  type IssueCommentEvent,
  type PullRequestEvent,
} from "../src/github/webhooks.js";

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

function makeCommentPayload(
  body = "@reviewbot review",
  action: IssueCommentEvent["action"] = "created",
  userType = "User"
): IssueCommentEvent {
  return {
    action,
    issue: {
      number: 1,
      pull_request: {
        url: "https://api.github.com/repos/acme/reviewbot/pulls/1",
      },
    },
    comment: {
      id: 777,
      body,
      user: {
        type: userType,
      },
    },
    repository: {
      full_name: "acme/reviewbot",
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

describe("hasReviewRequestMention", () => {
  test("accepts direct review mentions", () => {
    expect(hasReviewRequestMention("@reviewbot review")).toBe(true);
    expect(hasReviewRequestMention("please @reviewbot review this")).toBe(true);
    expect(hasReviewRequestMention("@my-bot review", "my-bot")).toBe(true);
  });

  test("rejects unrelated comments", () => {
    expect(hasReviewRequestMention("@reviewbot hello")).toBe(false);
    expect(hasReviewRequestMention("review this please")).toBe(false);
  });
});

describe("isReviewRequestCommentEvent", () => {
  test("accepts created PR comments with a review mention", () => {
    expect(isReviewRequestCommentEvent("issue_comment", makeCommentPayload())).toBe(true);
    expect(
      isReviewRequestCommentEvent(
        "issue_comment",
        makeCommentPayload("@my-bot review"),
        "my-bot"
      )
    ).toBe(true);
  });

  test("rejects bot-authored comments", () => {
    expect(
      isReviewRequestCommentEvent(
        "issue_comment",
        makeCommentPayload("@reviewbot review", "created", "Bot")
      )
    ).toBe(false);
  });

  test("rejects non-PR comments and edited comments", () => {
    expect(
      isReviewRequestCommentEvent("issue_comment", {
        ...makeCommentPayload(),
        issue: {
          number: 1,
        },
      })
    ).toBe(false);
    expect(
      isReviewRequestCommentEvent(
        "issue_comment",
        makeCommentPayload("@reviewbot review", "edited")
      )
    ).toBe(false);
  });
});
