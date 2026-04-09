import { describe, expect, test, mock } from "bun:test";

const warnings: Array<{ message: string; context?: Record<string, unknown> }> = [];

mock.module("../src/logger.js", () => ({
  logger: {
    warn: (message: string, context?: Record<string, unknown>) => {
      warnings.push({ message, context });
    },
  },
}));

const { isRetryableError, withRetry } = await import("../src/utils/retry.js");

describe("retry helpers", () => {
  test("withRetry retries and logs each failure", async () => {
    warnings.length = 0;

    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("temporary failure");
        }

        return "ok";
      },
      { maxAttempts: 3, initialDelayMs: 1 }
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(warnings).toHaveLength(2);
    expect(warnings[0].message).toBe("Retry attempt failed");
    expect(warnings[0].context).toMatchObject({ attempt: 1, delayMs: 1 });
  });

  test("isRetryableError recognizes transient failures", () => {
    expect(isRetryableError(new Error("request timeout"))).toBe(true);
    expect(isRetryableError(new Error("permission denied"))).toBe(false);
  });
});
