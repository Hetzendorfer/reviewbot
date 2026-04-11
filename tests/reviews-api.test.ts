import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'

let currentSession: { id: number } | null = null
let currentHasAccess = true
let currentInstallation: { id: number } | null = null
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

mock.module('../src/api/auth.js', () => ({
  validateSession: async () => currentSession,
}))

mock.module('../src/api/github-installations.js', () => ({
  getInstallationByGithubId: async () => currentInstallation,
  userHasInstallationAccess: async () => currentHasAccess,
}))

mock.module('../src/db/index.js', () => ({
  getDb: () => ({
    select: () => {
      if (currentQueryResults.length === 0) {
        throw new Error('Unexpected DB query in review history test')
      }

      return createQueryBuilder(currentQueryResults.shift())
    },
  }),
}))

const { statsRoutes } = await import('../src/api/stats.js')

describe('review history endpoint', () => {
  beforeEach(() => {
    currentSession = { id: 1 }
    currentHasAccess = true
    currentInstallation = { id: 42 }
    currentQueryResults = []
  })

  test('returns 403 when the user lacks installation access', async () => {
    currentHasAccess = false

    const app = new Elysia().use(statsRoutes)
    const response = await app.handle(
      new Request('http://localhost/api/installations/123/reviews')
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Access denied' })
  })

  test('returns paginated review history with ISO timestamps', async () => {
    currentQueryResults = [
      [
        {
          id: 3,
          repoFullName: 'acme/widget',
          prNumber: 101,
          prTitle: 'Reduce retries',
          commitSha: 'abc1234',
          llmProvider: 'openai',
          llmModel: 'gpt-4o',
          promptTokens: 3200,
          completionTokens: 1100,
          inlineCommentCount: 4,
          status: 'completed',
          durationMs: 2800,
          errorMessage: null,
          createdAt: new Date('2026-03-10T14:30:00.000Z'),
        },
        {
          id: 2,
          repoFullName: 'acme/widget',
          prNumber: 100,
          prTitle: 'Fix webhook retries',
          commitSha: 'def5678',
          llmProvider: 'anthropic',
          llmModel: 'claude-sonnet-4-6',
          promptTokens: null,
          completionTokens: null,
          inlineCommentCount: 0,
          status: 'failed',
          durationMs: null,
          errorMessage: 'Rate limited',
          createdAt: new Date('2026-03-09T09:15:00.000Z'),
        },
      ],
      [{ total: 25 }],
    ]

    const app = new Elysia().use(statsRoutes)
    const response = await app.handle(
      new Request(
        'http://localhost/api/installations/123/reviews?page=2&limit=20&status=all'
      )
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      reviews: [
        {
          id: 3,
          repoFullName: 'acme/widget',
          prNumber: 101,
          prTitle: 'Reduce retries',
          commitSha: 'abc1234',
          llmProvider: 'openai',
          llmModel: 'gpt-4o',
          promptTokens: 3200,
          completionTokens: 1100,
          inlineCommentCount: 4,
          status: 'completed',
          durationMs: 2800,
          errorMessage: null,
          createdAt: '2026-03-10T14:30:00.000Z',
        },
        {
          id: 2,
          repoFullName: 'acme/widget',
          prNumber: 100,
          prTitle: 'Fix webhook retries',
          commitSha: 'def5678',
          llmProvider: 'anthropic',
          llmModel: 'claude-sonnet-4-6',
          promptTokens: null,
          completionTokens: null,
          inlineCommentCount: 0,
          status: 'failed',
          durationMs: null,
          errorMessage: 'Rate limited',
          createdAt: '2026-03-09T09:15:00.000Z',
        },
      ],
      pagination: {
        page: 2,
        limit: 20,
        total: 25,
        totalPages: 2,
      },
    })
  })

  test('caps oversized limits at 100', async () => {
    currentQueryResults = [
      [],
      [{ total: 125 }],
    ]

    const app = new Elysia().use(statsRoutes)
    const response = await app.handle(
      new Request('http://localhost/api/installations/123/reviews?page=1&limit=999&status=completed')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      reviews: [],
      pagination: {
        page: 1,
        limit: 100,
        total: 125,
        totalPages: 2,
      },
    })
  })
})
