interface ModelPricing {
  promptUsdPer1k: number
  completionUsdPer1k: number
}

// TODO: Externalize pricing so model rates can be updated without code changes.
const MODEL_PRICING_USD_PER_1K: Record<string, ModelPricing> = {
  "gpt-4o": { promptUsdPer1k: 0.005, completionUsdPer1k: 0.015 },
  "gpt-4o-mini": { promptUsdPer1k: 0.00015, completionUsdPer1k: 0.0006 },
  "gpt-4-turbo": { promptUsdPer1k: 0.01, completionUsdPer1k: 0.03 },
  "claude-sonnet-4-6": { promptUsdPer1k: 0.003, completionUsdPer1k: 0.015 },
  "claude-opus-4-6": { promptUsdPer1k: 0.015, completionUsdPer1k: 0.075 },
  "claude-haiku-4-5-20251001": { promptUsdPer1k: 0.0008, completionUsdPer1k: 0.004 },
  "gemini-2.0-flash": { promptUsdPer1k: 0.0001, completionUsdPer1k: 0.0004 },
  "gemini-2.0-pro": { promptUsdPer1k: 0.00125, completionUsdPer1k: 0.005 }
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
