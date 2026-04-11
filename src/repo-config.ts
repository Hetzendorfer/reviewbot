import YAML from "yaml";
import type { Octokit } from "octokit";
import { z } from "zod";
import { fetchFileContent } from "./github/client.js";
import { logger } from "./logger.js";

export interface RepoConfig {
  ignorePaths?: string[];
  customInstructions?: string;
  maxFilesPerReview?: number;
  reviewStyle?: "inline" | "summary" | "both";
  enabled?: boolean;
}

const repoConfigSchema = z.object({
  ignorePaths: z.array(z.string().min(1).max(256)).max(50).optional(),
  customInstructions: z.string().max(2000).optional(),
  maxFilesPerReview: z.number().int().min(1).max(100).optional(),
  reviewStyle: z.enum(["inline", "summary", "both"]).optional(),
  enabled: z.boolean().optional(),
});

export function parseRepoConfig(content: string, source = ".reviewbot.yml"): RepoConfig | null {
  let parsed: unknown;

  try {
    parsed = YAML.parse(content);
  } catch {
    logger.warn("Failed to parse repo config YAML", { source });
    return null;
  }

  const result = repoConfigSchema.safeParse(parsed);
  if (!result.success) {
    logger.warn("Invalid repo config; falling back to DB defaults", {
      source,
      issues: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    });
    return null;
  }

  return result.data;
}

export async function fetchRepoConfig(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string
): Promise<RepoConfig | null> {
  const content = await fetchFileContent(
    octokit,
    owner,
    repo,
    ".reviewbot.yml",
    ref
  );
  if (!content) return null;

  return parseRepoConfig(content, `${owner}/${repo}:.reviewbot.yml`);
}

export function mergeConfig(
  dbSettings: {
    ignorePaths: string[];
    customInstructions: string | null;
    maxFilesPerReview: number;
    reviewStyle: "inline" | "summary" | "both";
    enabled: boolean;
  },
  repoConfig: RepoConfig | null
): {
  ignorePaths: string[];
  customInstructions?: string;
  maxFilesPerReview: number;
  reviewStyle: "inline" | "summary" | "both";
  enabled: boolean;
} {
  return {
    ignorePaths: repoConfig?.ignorePaths ?? dbSettings.ignorePaths,
    customInstructions:
      repoConfig?.customInstructions ?? dbSettings.customInstructions ?? undefined,
    maxFilesPerReview:
      repoConfig?.maxFilesPerReview ?? dbSettings.maxFilesPerReview,
    reviewStyle: repoConfig?.reviewStyle ?? dbSettings.reviewStyle,
    enabled: repoConfig?.enabled ?? dbSettings.enabled,
  };
}
