interface ModelPricing {
  promptUsdPer1k: number
  completionUsdPer1k: number
}

// TODO: Externalize pricing so model rates can be updated without code changes.
const MODEL_PRICING_USD_PER_1K: Record<string, ModelPricing> = {
  "gpt-5.4": { promptUsdPer1k: 0.0025, completionUsdPer1k: 0.015 },
  "claude-sonnet-4-5": { promptUsdPer1k: 0.003, completionUsdPer1k: 0.015 },
  // Gemini 2.5 Pro standard pricing for prompts <= 200k tokens.
  "gemini-2.5-pro": { promptUsdPer1k: 0.00125, completionUsdPer1k: 0.01 },
  "glm-5": { promptUsdPer1k: 0.001, completionUsdPer1k: 0.0032 },
  "kimi-k2.5": { promptUsdPer1k: 0.0006, completionUsdPer1k: 0.003 },
  "minimax-m2.5": { promptUsdPer1k: 0.0003, completionUsdPer1k: 0.0012 }
}

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number | null {
  const pricing = MODEL_PRICING_USD_PER_1K[model]
  if (!pricing) {
    return null
  }

  const cost = (
    (promptTokens / 1000) * pricing.promptUsdPer1k +
    (completionTokens / 1000) * pricing.completionUsdPer1k
  )

  return Number(cost.toFixed(6))
}
