import { beforeEach, describe, expect, mock, test } from "bun:test"
import { Elysia } from "elysia"

let currentSession: { id: number } | null = null
let currentHasAccess = true
let currentInstallation: { id: number } | null = null
let currentDbShouldThrow = true
let currentQueryResults: unknown[] = []

function createQueryBuilder(result: unknown) {
  const query = {
    from: () => query,
    where: () => query,
    groupBy: () => query,
    orderBy: () => query,
    limit: () => query,
    offset: async () => result,
    then: (onFulfilled: ((value: unknown) => unknown) | null | undefined, onRejected?: ((reason: unknown) => unknown) | null) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected: (reason: unknown) => unknown) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally: (() => void) | undefined) => Promise.resolve(result).finally(onFinally),
  }

  return query
}

mock.module("../src/api/auth.js", () => ({
  validateSession: async () => currentSession,
}))

mock.module("../src/api/github-installations.js", () => ({
  getInstallationByGithubId: async () => currentInstallation,
  userHasInstallationAccess: async () => currentHasAccess,
}))

mock.module("../src/db/index.js", () => ({
  getDb: () => {
    if (currentDbShouldThrow) {
      throw new Error("DB access should not occur in these route guard tests")
    }

    return {
      select: () => {
        if (currentQueryResults.length === 0) {
          throw new Error("Unexpected DB query in test")
        }

        return createQueryBuilder(currentQueryResults.shift())
      },
    }
  },
}))

const { statsRoutes, buildStatsResponse } = await import("../src/api/stats.js")

describe("statsRoutes", () => {
  beforeEach(() => {
    currentSession = null
    currentHasAccess = true
    currentInstallation = null
    currentDbShouldThrow = true
    currentQueryResults = []
  })

  test("returns 401 for stats without a valid session", async () => {
    const app = new Elysia().use(statsRoutes)
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/stats")
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Not authenticated" })
  })

  test("returns 403 for stats when the user lacks installation access", async () => {
    currentSession = { id: 1 }
    currentHasAccess = false

    const app = new Elysia().use(statsRoutes)
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/stats")
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "Access denied" })
  })

  test("returns 400 for invalid explicit date ranges", async () => {
    currentSession = { id: 1 }
    const app = new Elysia().use(statsRoutes)
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/stats?from=2026-02-31&to=2026-03-01")
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "Invalid date range" })
  })

  test("returns 400 for invalid provider filters", async () => {
    currentSession = { id: 1 }

    const app = new Elysia().use(statsRoutes)
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/stats?provider=ollama")
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "Invalid provider filter" })
  })

  test("returns 400 for invalid model filters", async () => {
    currentSession = { id: 1 }

    const app = new Elysia().use(statsRoutes)
    const response = await app.handle(
      new Request(`http://localhost/api/installations/123/stats?model=${"x".repeat(101)}`)
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "Invalid model filter" })
  })

  test("returns empty stats when the installation has no local record", async () => {
    currentSession = { id: 1 }
    const app = new Elysia().use(statsRoutes)
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/stats")
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      totals: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        reviewCount: 0,
        failedCount: 0,
        avgDurationMs: 0,
        estimatedCostUsd: 0,
      },
      byProvider: [],
      daily: [],
    })
  })

  test("returns aggregated stats with zero-filled daily gaps", async () => {
    currentSession = { id: 1 }
    currentInstallation = { id: 7 }
    currentDbShouldThrow = false
    currentQueryResults = [
      [{
        reviewCount: 3,
        failedCount: 1,
        avgDurationMs: 2300,
      }],
      [{
        promptTokens: 2500,
        completionTokens: 900,
      }],
      [
        {
          provider: "openai",
          model: "gpt-4o",
          promptTokens: 2000,
          completionTokens: 800,
          reviewCount: 2,
        },
        {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          promptTokens: 500,
          completionTokens: 100,
          reviewCount: 1,
        },
      ],
      [
        {
          date: "2026-03-01",
          provider: "openai",
          model: "gpt-4o",
          promptTokens: 1000,
          completionTokens: 400,
          reviewCount: 1,
        },
        {
          date: "2026-03-03",
          provider: "openai",
          model: "gpt-4o",
          promptTokens: 1000,
          completionTokens: 400,
          reviewCount: 1,
        },
        {
          date: "2026-03-03",
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          promptTokens: 500,
          completionTokens: 100,
          reviewCount: 1,
        },
      ],
    ]

    const app = new Elysia().use(statsRoutes)
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/stats?from=2026-03-01&to=2026-03-03")
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      totals: {
        promptTokens: 2500,
        completionTokens: 900,
        totalTokens: 3400,
        reviewCount: 3,
        failedCount: 1,
        avgDurationMs: 2300,
        estimatedCostUsd: 0.025,
      },
      byProvider: [
        {
          provider: "openai",
          model: "gpt-4o",
          promptTokens: 2000,
          completionTokens: 800,
          reviewCount: 2,
          estimatedCostUsd: 0.022,
        },
        {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          promptTokens: 500,
          completionTokens: 100,
          reviewCount: 1,
          estimatedCostUsd: 0.003,
        },
      ],
      daily: [
        {
          date: "2026-03-01",
          promptTokens: 1000,
          completionTokens: 400,
          reviewCount: 1,
          estimatedCostUsd: 0.011,
        },
        {
          date: "2026-03-02",
          promptTokens: 0,
          completionTokens: 0,
          reviewCount: 0,
          estimatedCostUsd: 0,
        },
        {
          date: "2026-03-03",
          promptTokens: 1500,
          completionTokens: 500,
          reviewCount: 2,
          estimatedCostUsd: 0.014,
        },
      ],
    })
  })
})

describe("buildStatsResponse", () => {
  test("aggregates provider and daily stats with estimated cost", () => {
    const result = buildStatsResponse(
      {
        reviewCount: 4,
        failedCount: 1,
        avgDurationMs: 2800,
      },
      {
        promptTokens: 3000,
        completionTokens: 1200,
      },
      [
        {
          provider: "openai",
          model: "gpt-4o",
          promptTokens: 2000,
          completionTokens: 800,
          reviewCount: 3,
        },
        {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          promptTokens: 1000,
          completionTokens: 400,
          reviewCount: 1,
        },
      ],
      [
        {
          date: "2026-03-10",
          provider: "openai",
          model: "gpt-4o",
          promptTokens: 1200,
          completionTokens: 500,
          reviewCount: 2,
        },
        {
          date: "2026-03-10",
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          promptTokens: 300,
          completionTokens: 100,
          reviewCount: 1,
        },
        {
          date: "2026-03-11",
          provider: "openai",
          model: "gpt-4o",
          promptTokens: 1500,
          completionTokens: 600,
          reviewCount: 1,
        },
      ]
    )

    expect(result.totals).toEqual({
      promptTokens: 3000,
      completionTokens: 1200,
      totalTokens: 4200,
      reviewCount: 4,
      failedCount: 1,
      avgDurationMs: 2800,
      estimatedCostUsd: 0.031,
    })

    expect(result.byProvider).toEqual([
      {
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 2000,
        completionTokens: 800,
        reviewCount: 3,
        estimatedCostUsd: 0.022,
      },
      {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        promptTokens: 1000,
        completionTokens: 400,
        reviewCount: 1,
        estimatedCostUsd: 0.009,
      },
    ])

    expect(result.daily).toEqual([
      {
        date: "2026-03-10",
        promptTokens: 1500,
        completionTokens: 600,
        reviewCount: 3,
        estimatedCostUsd: 0.0159,
      },
      {
        date: "2026-03-11",
        promptTokens: 1500,
        completionTokens: 600,
        reviewCount: 1,
        estimatedCostUsd: 0.0165,
      },
    ])
  })
})

describe("review history route guards", () => {
  beforeEach(() => {
    currentSession = null
    currentHasAccess = true
    currentInstallation = null
    currentDbShouldThrow = true
    currentQueryResults = []
  })

  test("returns 401 for review history without a valid session", async () => {
    const app = new Elysia().use(statsRoutes)
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/reviews")
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Not authenticated" })
  })

  test("returns 400 for invalid pagination", async () => {
    currentSession = { id: 1 }

    const app = new Elysia().use(statsRoutes)
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/reviews?page=0&limit=20")
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "Invalid pagination" })
  })

  test("returns 400 for invalid status filters", async () => {
    currentSession = { id: 1 }

    const app = new Elysia().use(statsRoutes)
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/reviews?status=done")
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "Invalid status filter" })
  })

  test("returns empty review history when the installation has no local record", async () => {
    currentSession = { id: 1 }
    currentDbShouldThrow = false
    const app = new Elysia().use(statsRoutes)
    const response = await app.handle(
      new Request("http://localhost/api/installations/123/reviews?page=1&limit=20&status=all")
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      reviews: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    })
  })
})
