export interface User {
  username: string
  avatar: string
}

export interface Installation {
  id: number
  account: string
  avatar: string
  type: string
  selection: string
}

export type LlmProvider = 'openai' | 'anthropic' | 'gemini' | 'opencode'

export interface Settings {
  installationId: number
  llmProvider: LlmProvider
  llmModel: string
  reviewStyle: 'both' | 'inline' | 'summary'
  hasApiKey: boolean
  ignorePaths: string[]
  customInstructions: string
  maxFilesPerReview: number
  enabled: boolean
}

export interface TokenStats {
  totals: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    reviewCount: number
    failedCount: number
    avgDurationMs: number
    estimatedCostUsd: number
  }
  byProvider: {
    provider: LlmProvider
    model: string
    promptTokens: number
    completionTokens: number
    reviewCount: number
    estimatedCostUsd: number
  }[]
  daily: {
    date: string
    promptTokens: number
    completionTokens: number
    reviewCount: number
    estimatedCostUsd: number
  }[]
}

export interface Review {
  id: number
  repoFullName: string
  prNumber: number
  prTitle: string
  commitSha: string
  llmProvider: LlmProvider
  llmModel: string
  promptTokens: number | null
  completionTokens: number | null
  inlineCommentCount: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  durationMs: number | null
  errorMessage: string | null
  createdAt: string
}

export interface PaginatedReviews {
  reviews: Review[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}
