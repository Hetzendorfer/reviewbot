import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'

let currentMetricsToken: string | undefined = 'test-token'
let currentDbShouldThrow = false
let currentQueueStats = {
  pending: 1,
  processing: 0,
  failed: 0,
}
let currentQueryResults: unknown[] = []

const originalNodeEnv = process.env.NODE_ENV

function createQueryBuilder(result: unknown) {
  const query = {
    from: () => query,
    where: () => query,
    then: (onFulfilled: ((value: unknown) => unknown) | null | undefined, onRejected?: ((reason: unknown) => unknown) | null) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected: (reason: unknown) => unknown) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally: (() => void) | undefined) => Promise.resolve(result).finally(onFinally),
  }

  return query
}

mock.module('../src/config.js', () => ({
  loadConfig: () => ({
    METRICS_TOKEN: currentMetricsToken,
  }),
}))

mock.module('../src/db/index.js', () => ({
  getDb: () => {
    if (currentDbShouldThrow) {
      throw new Error('DB unavailable')
    }

    return {
      select: () => {
        if (currentQueryResults.length === 0) {
          throw new Error('Unexpected DB query in metrics test')
        }

        return createQueryBuilder(currentQueryResults.shift())
      },
    }
  },
}))

mock.module('../src/review/pipeline.js', () => ({
  getQueueStats: async () => currentQueueStats,
}))

const {
  buildMetricsResponse,
  extractBearerToken,
  metricsRoutes,
  verifyMetricsToken,
} = await import('../src/api/metrics.js')

describe('metrics helpers', () => {
  beforeEach(() => {
    currentMetricsToken = 'test-token'
    currentDbShouldThrow = false
    currentQueueStats = { pending: 1, processing: 0, failed: 0 }
    currentQueryResults = []
    process.env.NODE_ENV = originalNodeEnv
  })

  test('extractBearerToken parses valid headers', () => {
    expect(extractBearerToken('Bearer secret')).toBe('secret')
    expect(extractBearerToken('Bearer secret extra')).toBeNull()
    expect(extractBearerToken('Basic secret')).toBeNull()
  })

  test('verifyMetricsToken validates the expected bearer token', () => {
    expect(verifyMetricsToken('Bearer test-token', 'test-token')).toBe(true)
    expect(verifyMetricsToken('Bearer wrong-token', 'test-token')).toBe(false)
    expect(verifyMetricsToken('Bearer short', 'longer-token')).toBe(false)
  })

  test('buildMetricsResponse returns aggregated review and token totals', async () => {
    currentQueryResults = [
      [{ count: 120 }],
      [{ count: 3 }],
      [{ avg: 2800.4 }],
      [{ promptTokens: 500000, completionTokens: 175000 }],
    ]
    currentQueueStats = { pending: 2, processing: 1, failed: 4 }

    expect(await buildMetricsResponse()).toEqual({
      reviews: {
        total: 120,
        failed: 3,
        avgDurationMs: 2800,
      },
      tokens: {
        totalPromptTokens: 500000,
        totalCompletionTokens: 175000,
        totalTokens: 675000,
      },
      queue: {
        pending: 2,
        processing: 1,
        failed: 4,
      },
    })
  })
})

describe('metrics route', () => {
  beforeEach(() => {
    currentMetricsToken = 'test-token'
    currentDbShouldThrow = false
    currentQueueStats = { pending: 1, processing: 0, failed: 0 }
    currentQueryResults = []
    process.env.NODE_ENV = originalNodeEnv
  })

  test('returns 401 when the auth header is missing', async () => {
    const app = new Elysia().use(metricsRoutes)
    const response = await app.handle(new Request('http://localhost/metrics'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  test('returns 503 when METRICS_TOKEN is missing outside production', async () => {
    currentMetricsToken = undefined
    process.env.NODE_ENV = 'development'

    const app = new Elysia().use(metricsRoutes)
    const response = await app.handle(
      new Request('http://localhost/metrics', {
        headers: { authorization: 'Bearer anything' },
      })
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Metrics unavailable' })
  })

  test('returns 404 when METRICS_TOKEN is missing in production', async () => {
    currentMetricsToken = undefined
    process.env.NODE_ENV = 'production'

    const app = new Elysia().use(metricsRoutes)
    const response = await app.handle(
      new Request('http://localhost/metrics', {
        headers: { authorization: 'Bearer anything' },
      })
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Metrics unavailable' })
  })

  test('returns metrics payload with token totals for valid requests', async () => {
    currentQueryResults = [
      [{ count: 120 }],
      [{ count: 3 }],
      [{ avg: 2800.4 }],
      [{ promptTokens: 500000, completionTokens: 175000 }],
    ]
    currentQueueStats = { pending: 2, processing: 1, failed: 4 }

    const app = new Elysia().use(metricsRoutes)
    const response = await app.handle(
      new Request('http://localhost/metrics', {
        headers: { authorization: 'Bearer test-token' },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      reviews: {
        total: 120,
        failed: 3,
        avgDurationMs: 2800,
      },
      tokens: {
        totalPromptTokens: 500000,
        totalCompletionTokens: 175000,
        totalTokens: 675000,
      },
      queue: {
        pending: 2,
        processing: 1,
        failed: 4,
      },
    })
  })

  test('returns 503 when metrics aggregation fails', async () => {
    currentDbShouldThrow = true

    const app = new Elysia().use(metricsRoutes)
    const response = await app.handle(
      new Request('http://localhost/metrics', {
        headers: { authorization: 'Bearer test-token' },
      })
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Metrics unavailable' })
  })
})
