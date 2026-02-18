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

export type LlmProvider = 'openai' | 'anthropic' | 'gemini'

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

export type View = 'loading' | 'login' | 'dashboard' | 'settings'
