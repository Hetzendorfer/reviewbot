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

export interface WebhookTrace {
  id: string
  timestamp: string
  deliveryId: string | null
  event: string | null
  action: string | null
  repoFullName: string | null
  installationId: number | null
  prNumber: number | null
  stage: string
  detail: string | null
  ok: boolean
}

export interface ReviewJobDiagnostic {
  id: number
  repoFullName: string
  prNumber: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface ReviewDiagnostic {
  id: number
  repoFullName: string
  prNumber: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  errorMessage: string | null
  inlineCommentCount: number
  createdAt: string
}

export interface InstallationDiagnostics {
  appSlug: string
  triggerPhrase: string
  webhookEndpoint: string
  queue: {
    pending: number
    processing: number
    failed: number
  }
  installation: {
    existsLocally: boolean
    enabled: boolean
    hasApiKey: boolean
    provider: LlmProvider | null
    model: string | null
  }
  recentWebhookTraces: WebhookTrace[]
  recentJobs: ReviewJobDiagnostic[]
  recentReviews: ReviewDiagnostic[]
}
