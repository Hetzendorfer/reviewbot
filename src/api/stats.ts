import { and, desc, eq, gte, lte, sql } from "drizzle-orm"
import { Elysia } from "elysia"
import { getDb } from "../db/index.js"
import { reviews } from "../db/schema.js"
import { estimateCostUsd } from "../monitoring/pricing.js"
import { validateSession } from "./auth.js"
import {
  getInstallationByGithubId,
  userHasInstallationAccess,
} from "./github-installations.js"

const DEFAULT_HISTORY_LIMIT = 20
const MAX_HISTORY_LIMIT = 100
const DEFAULT_RANGE_DAYS = 30
const LLM_PROVIDERS = ["openai", "anthropic", "gemini"] as const

const REVIEW_STATUSES = ["pending", "processing", "completed", "failed"] as const
type ReviewStatusFilter = typeof REVIEW_STATUSES[number] | "all"
type ProviderFilter = typeof LLM_PROVIDERS[number] | "all"

interface DateRange {
  from: Date
  to: Date
}

interface StatsFilterInput {
  provider?: ProviderFilter
  model?: string
}

interface ProviderStatsRow {
  provider: string
  model: string
  promptTokens: unknown
  completionTokens: unknown
  reviewCount: unknown
}

interface DailyStatsRow extends ProviderStatsRow {
  date: string
}

interface TotalsRow {
  reviewCount?: unknown
  failedCount?: unknown
  avgDurationMs?: unknown
}

interface TokenTotalsRow {
  promptTokens?: unknown
  completionTokens?: unknown
}

function toUtcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
    0
  ))
}

function toUtcEndOfDay(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    23,
    59,
    59,
    999
  ))
}

function parseDateParam(value: unknown, mode: "start" | "end"): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null
  }

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getUTCFullYear() !== Number(year) ||
      parsed.getUTCMonth() !== Number(month) - 1 ||
      parsed.getUTCDate() !== Number(day)
    ) {
      return null
    }
    return mode === "start" ? toUtcStartOfDay(parsed) : toUtcEndOfDay(parsed)
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return mode === "start" ? toUtcStartOfDay(parsed) : toUtcEndOfDay(parsed)
}

export function getDateRange(
  fromValue: unknown,
  toValue: unknown,
  now = new Date()
): DateRange | null {
  const defaultTo = toUtcEndOfDay(now)
  const defaultFrom = toUtcStartOfDay(
    new Date(Date.UTC(
      defaultTo.getUTCFullYear(),
      defaultTo.getUTCMonth(),
      defaultTo.getUTCDate() - (DEFAULT_RANGE_DAYS - 1)
    ))
  )

  const parsedFrom = parseDateParam(fromValue, "start")
  if (fromValue !== undefined && parsedFrom === null) {
    return null
  }

  const parsedTo = parseDateParam(toValue, "end")
  if (toValue !== undefined && parsedTo === null) {
    return null
  }

  const from = parsedFrom ?? defaultFrom
  const to = parsedTo ?? defaultTo

  if (from > to) {
    return null
  }

  return { from, to }
}

export function getProviderFilter(value: unknown): ProviderFilter | null {
  if (value === undefined) {
    return "all"
  }

  if (typeof value !== "string") {
    return null
  }

  if (value === "all") {
    return value
  }

  return LLM_PROVIDERS.includes(value as typeof LLM_PROVIDERS[number])
    ? (value as ProviderFilter)
    : null
}

export function getModelFilter(value: unknown): string | null {
  if (value === undefined) {
    return null
  }

  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.length <= 100 ? trimmed : null
}

export function getReviewStatusFilter(value: unknown): ReviewStatusFilter | null {
  if (value === undefined) {
    return "all"
  }

  if (typeof value !== "string") {
    return null
  }

  if (value === "all") {
    return value
  }

  return REVIEW_STATUSES.includes(value as typeof REVIEW_STATUSES[number])
    ? (value as ReviewStatusFilter)
    : null
}

export function getPagination(
  pageValue: unknown,
  limitValue: unknown
): { page: number; limit: number; offset: number } | null {
  const page = pageValue === undefined ? 1 : Number.parseInt(String(pageValue), 10)
  const rawLimit = limitValue === undefined
    ? DEFAULT_HISTORY_LIMIT
    : Number.parseInt(String(limitValue), 10)

  if (!Number.isFinite(page) || page < 1 || !Number.isFinite(rawLimit) || rawLimit < 1) {
    return null
  }

  const limit = Math.min(rawLimit, MAX_HISTORY_LIMIT)
  return {
    page,
    limit,
    offset: (page - 1) * limit,
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function getReviewRangeFilter(installationDbId: number, range: DateRange) {
  return and(
    eq(reviews.installationId, installationDbId),
    gte(reviews.createdAt, range.from),
    lte(reviews.createdAt, range.to)
  )
}

function getStatsFilter(
  installationDbId: number,
  range: DateRange,
  filters: StatsFilterInput = {}
) {
  const conditions = [
    eq(reviews.installationId, installationDbId),
    gte(reviews.createdAt, range.from),
    lte(reviews.createdAt, range.to),
  ]

  if (filters.provider && filters.provider !== "all") {
    conditions.push(eq(reviews.llmProvider, filters.provider))
  }

  if (filters.model) {
    conditions.push(eq(reviews.llmModel, filters.model))
  }

  return and(...conditions)
}

function getInstallationReviewFilter(
  installationDbId: number,
  status: ReviewStatusFilter
) {
  return status === "all"
    ? eq(reviews.installationId, installationDbId)
    : and(
        eq(reviews.installationId, installationDbId),
        eq(reviews.status, status)
      )
}

function getCostEstimateTotal(rows: ProviderStatsRow[]): number {
  return Number(rows.reduce((sum, row) => {
    const cost = estimateCostUsd(
      row.model,
      toNumber(row.promptTokens),
      toNumber(row.completionTokens)
    )
    return sum + (cost ?? 0)
  }, 0).toFixed(6))
}

export function buildEmptyStatsResponse() {
  return {
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
  }
}

export function buildStatsResponse(
  totalsRow: TotalsRow | undefined,
  tokenTotalsRow: TokenTotalsRow | undefined,
  byProviderRows: ProviderStatsRow[],
  dailyRows: DailyStatsRow[]
) {
  const promptTokens = toNumber(tokenTotalsRow?.promptTokens)
  const completionTokens = toNumber(tokenTotalsRow?.completionTokens)
  const normalizedByProvider = byProviderRows.map((row) => {
    const rowPromptTokens = toNumber(row.promptTokens)
    const rowCompletionTokens = toNumber(row.completionTokens)
    return {
      provider: row.provider,
      model: row.model,
      promptTokens: rowPromptTokens,
      completionTokens: rowCompletionTokens,
      reviewCount: toNumber(row.reviewCount),
      estimatedCostUsd: estimateCostUsd(
        row.model,
        rowPromptTokens,
        rowCompletionTokens
      ) ?? 0,
    }
  })

  const dailyMap = new Map<string, {
    date: string
    promptTokens: number
    completionTokens: number
    reviewCount: number
    estimatedCostUsd: number
  }>()

  for (const row of dailyRows) {
    const rowPromptTokens = toNumber(row.promptTokens)
    const rowCompletionTokens = toNumber(row.completionTokens)
    const existing = dailyMap.get(row.date)
    const estimatedCostUsd = estimateCostUsd(
      row.model,
      rowPromptTokens,
      rowCompletionTokens
    ) ?? 0

    if (existing) {
      existing.promptTokens += rowPromptTokens
      existing.completionTokens += rowCompletionTokens
      existing.reviewCount += toNumber(row.reviewCount)
      existing.estimatedCostUsd = Number((existing.estimatedCostUsd + estimatedCostUsd).toFixed(6))
      continue
    }

    dailyMap.set(row.date, {
      date: row.date,
      promptTokens: rowPromptTokens,
      completionTokens: rowCompletionTokens,
      reviewCount: toNumber(row.reviewCount),
      estimatedCostUsd,
    })
  }

  return {
    totals: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      reviewCount: toNumber(totalsRow?.reviewCount),
      failedCount: toNumber(totalsRow?.failedCount),
      avgDurationMs: Math.round(toNumber(totalsRow?.avgDurationMs)),
      estimatedCostUsd: getCostEstimateTotal(byProviderRows),
    },
    byProvider: normalizedByProvider,
    daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
  }
}

export const statsRoutes = new Elysia({ prefix: "/api/installations" })
  .get("/:installationId/stats", async ({ params, query, cookie, set }) => {
    const session = await validateSession(cookie.session?.value as string | undefined)
    if (!session) {
      set.status = 401
      return { error: "Not authenticated" }
    }

    const githubInstallationId = Number.parseInt(params.installationId, 10)
    if (!Number.isFinite(githubInstallationId)) {
      set.status = 400
      return { error: "Invalid installation ID" }
    }

    if (!await userHasInstallationAccess(session, githubInstallationId)) {
      set.status = 403
      return { error: "Access denied" }
    }

    const range = getDateRange(query.from, query.to)
    if (!range) {
      set.status = 400
      return { error: "Invalid date range" }
    }

    const provider = getProviderFilter(query.provider)
    if (!provider) {
      set.status = 400
      return { error: "Invalid provider filter" }
    }

    const model = getModelFilter(query.model)
    if (query.model !== undefined && !model) {
      set.status = 400
      return { error: "Invalid model filter" }
    }

    const installation = await getInstallationByGithubId(githubInstallationId)
    if (!installation) {
      return buildEmptyStatsResponse()
    }

    const db = getDb()
    const reviewRangeFilter = getStatsFilter(installation.id, range, {
      provider,
      model: model ?? undefined,
    })

    const [totalsRow] = await db
      .select({
        reviewCount: sql<number>`count(*)`,
        failedCount: sql<number>`count(*) filter (where ${reviews.status} = 'failed')`,
        avgDurationMs: sql<number>`avg(${reviews.durationMs}) filter (where ${reviews.durationMs} is not null)`,
      })
      .from(reviews)
      .where(reviewRangeFilter)

    const [tokenTotalsRow] = await db
      .select({
        promptTokens: sql<number>`coalesce(sum(${reviews.promptTokens}), 0)`,
        completionTokens: sql<number>`coalesce(sum(${reviews.completionTokens}), 0)`,
      })
      .from(reviews)
      .where(and(
        reviewRangeFilter,
        eq(reviews.status, "completed")
      ))

    const byProviderRows = await db
      .select({
        provider: reviews.llmProvider,
        model: reviews.llmModel,
        promptTokens: sql<number>`coalesce(sum(${reviews.promptTokens}) filter (where ${reviews.status} = 'completed'), 0)`,
        completionTokens: sql<number>`coalesce(sum(${reviews.completionTokens}) filter (where ${reviews.status} = 'completed'), 0)`,
        reviewCount: sql<number>`count(*)`,
      })
      .from(reviews)
      .where(reviewRangeFilter)
      .groupBy(reviews.llmProvider, reviews.llmModel)
      .orderBy(desc(sql`coalesce(sum(${reviews.promptTokens}) + sum(${reviews.completionTokens}), 0)`))

    const dailyRows = await db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${reviews.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        provider: reviews.llmProvider,
        model: reviews.llmModel,
        promptTokens: sql<number>`coalesce(sum(${reviews.promptTokens}) filter (where ${reviews.status} = 'completed'), 0)`,
        completionTokens: sql<number>`coalesce(sum(${reviews.completionTokens}) filter (where ${reviews.status} = 'completed'), 0)`,
        reviewCount: sql<number>`count(*)`,
      })
      .from(reviews)
      .where(reviewRangeFilter)
      .groupBy(
        sql`date_trunc('day', ${reviews.createdAt} at time zone 'UTC')`,
        reviews.llmProvider,
        reviews.llmModel
      )
      .orderBy(sql`date_trunc('day', ${reviews.createdAt} at time zone 'UTC') asc`)

    return buildStatsResponse(
      totalsRow,
      tokenTotalsRow,
      byProviderRows as ProviderStatsRow[],
      dailyRows as DailyStatsRow[]
    )
  })
  .get("/:installationId/reviews", async ({ params, query, cookie, set }) => {
    const session = await validateSession(cookie.session?.value as string | undefined)
    if (!session) {
      set.status = 401
      return { error: "Not authenticated" }
    }

    const githubInstallationId = Number.parseInt(params.installationId, 10)
    if (!Number.isFinite(githubInstallationId)) {
      set.status = 400
      return { error: "Invalid installation ID" }
    }

    if (!await userHasInstallationAccess(session, githubInstallationId)) {
      set.status = 403
      return { error: "Access denied" }
    }

    const pagination = getPagination(query.page, query.limit)
    if (!pagination) {
      set.status = 400
      return { error: "Invalid pagination" }
    }

    const status = getReviewStatusFilter(query.status)
    if (!status) {
      set.status = 400
      return { error: "Invalid status filter" }
    }

    const installation = await getInstallationByGithubId(githubInstallationId)
    if (!installation) {
      return {
        reviews: [],
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total: 0,
          totalPages: 0,
        },
      }
    }

    const db = getDb()
    const reviewFilter = getInstallationReviewFilter(installation.id, status)

    const rows = await db
      .select({
        id: reviews.id,
        repoFullName: reviews.repoFullName,
        prNumber: reviews.prNumber,
        prTitle: reviews.prTitle,
        commitSha: reviews.commitSha,
        llmProvider: reviews.llmProvider,
        llmModel: reviews.llmModel,
        promptTokens: reviews.promptTokens,
        completionTokens: reviews.completionTokens,
        inlineCommentCount: reviews.inlineCommentCount,
        status: reviews.status,
        durationMs: reviews.durationMs,
        errorMessage: reviews.errorMessage,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .where(reviewFilter)
      .orderBy(desc(reviews.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset)

    const [countRow] = await db
      .select({
        total: sql<number>`count(*)`,
      })
      .from(reviews)
      .where(reviewFilter)

    const total = toNumber(countRow?.total)

    return {
      reviews: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pagination.limit),
      },
    }
  })
