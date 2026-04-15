import { describe, expect, test } from "bun:test";
import { estimateCostUsd } from "../src/monitoring/pricing.js";

describe("estimateCostUsd", () => {
  test("returns the current GPT-5.4 price estimate", () => {
    expect(estimateCostUsd("gpt-5.4", 1000, 1000)).toBe(0.0175);
  });

  test("returns null for unknown models", () => {
    expect(estimateCostUsd("unknown-model", 1000, 1000)).toBeNull();
  });
});
