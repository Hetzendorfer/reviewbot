import YAML from "yaml";
import type { Octokit } from "octokit";
import { fetchFileContent } from "./github/client.js";

export interface RepoConfig {
  ignorePaths?: string[];
  customInstructions?: string;
  maxFilesPerReview?: number;
  reviewStyle?: "inline" | "summary" | "both";
  enabled?: boolean;
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

  try {
    return YAML.parse(content) as RepoConfig;
  } catch {
    console.warn(`Failed to parse .reviewbot.yml in ${owner}/${repo}`);
    return null;
  }
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
