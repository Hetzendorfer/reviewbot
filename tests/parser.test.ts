import { describe, test, expect } from "bun:test";
import { parseReviewResponse } from "../src/review/parser.js";

describe("parseReviewResponse", () => {
  test("parses summary and comments", () => {
    const raw = `## Summary
This PR adds CORS support. Looks good overall with one issue.

## Comments

### [WARNING] src/index.ts:5
The cors() call should include origin configuration for production use.

### [SUGGESTION] package.json:8
Consider pinning the exact version instead of using a caret range.
`;
    const result = parseReviewResponse(raw);

    expect(result.summary).toBe(
      "This PR adds CORS support. Looks good overall with one issue."
    );
    expect(result.comments).toHaveLength(2);

    expect(result.comments[0].severity).toBe("warning");
    expect(result.comments[0].path).toBe("src/index.ts");
    expect(result.comments[0].line).toBe(5);
    expect(result.comments[0].body).toContain("cors()");

    expect(result.comments[1].severity).toBe("suggestion");
    expect(result.comments[1].path).toBe("package.json");
    expect(result.comments[1].line).toBe(8);
  });

  test("handles response with no comments", () => {
    const raw = `## Summary
Clean PR with no issues found.

## Comments
`;
    const result = parseReviewResponse(raw);
    expect(result.summary).toBe("Clean PR with no issues found.");
    expect(result.comments).toHaveLength(0);
  });

  test("handles all severity levels", () => {
    const raw = `## Summary
Test

## Comments

### [CRITICAL] a.ts:1
Critical issue

### [WARNING] b.ts:2
Warning

### [SUGGESTION] c.ts:3
Suggestion

### [NITPICK] d.ts:4
Nitpick
`;
    const result = parseReviewResponse(raw);
    expect(result.comments).toHaveLength(4);
    expect(result.comments.map((c) => c.severity)).toEqual([
      "critical",
      "warning",
      "suggestion",
      "nitpick",
    ]);
  });

  test("handles malformed response gracefully", () => {
    const result = parseReviewResponse("Just some plain text response");
    expect(result.summary).toBe("Just some plain text response");
    expect(result.comments).toHaveLength(0);
  });
});
