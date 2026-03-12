import { timingSafeEqual } from 'crypto'
import { eq, sql } from 'drizzle-orm'
import { Elysia } from 'elysia'
import { loadConfig } from '../config.js'
import { getDb } from '../db/index.js'
import { reviews } from '../db/schema.js'
import { getQueueStats } from '../review/pipeline.js'

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) {
    return null
  }

  const [scheme, token, ...rest] = authHeader.split(' ')
  if (scheme !== 'Bearer' || !token || rest.length > 0) {
    return null
  }

  return token
}

export function verifyMetricsToken(
  authHeader: string | null,
  expectedToken: string
): boolean {
  const providedToken = extractBearerToken(authHeader)
  if (!providedToken) {
    return false
  }

  const provided = Buffer.from(providedToken, 'utf-8')
  const expected = Buffer.from(expectedToken, 'utf-8')
  if (provided.length !== expected.length) {
    return false
  }

  return timingSafeEqual(provided, expected)
}

export async function buildMetricsResponse() {
  const db = getDb()

  const totalReviews = await db
    .select({ count: sql<number>`count(*)` })
    .from(reviews)

  const failedReviews = await db
    .select({ count: sql<number>`count(*)` })
    .from(reviews)
    .where(eq(reviews.status, 'failed'))

  const avgDuration = await db
    .select({ avg: sql<number>`avg(duration_ms)` })
    .from(reviews)
    .where(sql`duration_ms IS NOT NULL`)

  const [tokenTotals] = await db
    .select({
      promptTokens: sql<number>`coalesce(sum(prompt_tokens), 0)`,
      completionTokens: sql<number>`coalesce(sum(completion_tokens), 0)`,
    })
    .from(reviews)
    .where(eq(reviews.status, 'completed'))

  const queueStats = await getQueueStats()
  const totalPromptTokens = tokenTotals?.promptTokens ?? 0
  const totalCompletionTokens = tokenTotals?.completionTokens ?? 0

  return {
    reviews: {
      total: totalReviews[0]?.count ?? 0,
      failed: failedReviews[0]?.count ?? 0,
      avgDurationMs: Math.round(avgDuration[0]?.avg ?? 0),
    },
    tokens: {
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
    },
    queue: queueStats,
  }
}

export const metricsRoutes = new Elysia()
  .get('/metrics', async ({ set, request }) => {
    const config = loadConfig()

    if (!config.METRICS_TOKEN) {
      set.status = process.env.NODE_ENV === 'production' ? 404 : 503
      return { error: 'Metrics unavailable' }
    }

    if (!verifyMetricsToken(
      request.headers.get('authorization'),
      config.METRICS_TOKEN
    )) {
      set.status = 401
      return { error: 'Unauthorized' }
    }

    try {
      return await buildMetricsResponse()
    } catch {
      set.status = 503
      return { error: 'Metrics unavailable' }
    }
  })
