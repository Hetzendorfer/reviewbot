import { describe, expect, test } from "bun:test";
import { mergeConfig, parseRepoConfig } from "../src/repo-config.js";

describe("parseRepoConfig", () => {
  test("accepts valid repo config values", () => {
    expect(
      parseRepoConfig(
        [
          "enabled: false",
          "reviewStyle: summary",
          "maxFilesPerReview: 12",
          "ignorePaths:",
          "  - dist/**",
        ].join("\n")
      )
    ).toEqual({
      enabled: false,
      reviewStyle: "summary",
      maxFilesPerReview: 12,
      ignorePaths: ["dist/**"],
    });
  });

  test("returns null for schema-invalid repo config", () => {
    expect(
      parseRepoConfig(
        [
          "enabled: yup",
          "maxFilesPerReview: a-lot",
        ].join("\n")
      )
    ).toBeNull();
  });
});

describe("mergeConfig", () => {
  test("falls back to DB defaults when repo config is invalid", () => {
    const dbSettings = {
      ignorePaths: [".lock"],
      customInstructions: "Use DB defaults",
      maxFilesPerReview: 20,
      reviewStyle: "both" as const,
      enabled: true,
    };

    expect(mergeConfig(dbSettings, null)).toEqual({
      ignorePaths: [".lock"],
      customInstructions: "Use DB defaults",
      maxFilesPerReview: 20,
      reviewStyle: "both",
      enabled: true,
    });
  });
});
