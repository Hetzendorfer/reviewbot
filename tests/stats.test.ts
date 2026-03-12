import { describe, expect, test } from "bun:test"
import {
  fillMissingDailyStats,
  getDateRange,
  getModelFilter,
  getPagination,
  getProviderFilter,
  getReviewStatusFilter,
} from "../src/api/stats.js"

describe("getDateRange", () => {
  test("defaults to the last 30 UTC days", () => {
    const now = new Date("2026-03-11T15:45:00.000Z")
    const range = getDateRange(undefined, undefined, now)

    expect(range).not.toBeNull()
    expect(range?.from.toISOString()).toBe("2026-02-10T00:00:00.000Z")
    expect(range?.to.toISOString()).toBe("2026-03-11T23:59:59.999Z")
  })

  test("parses explicit date-only params as UTC day boundaries", () => {
    const range = getDateRange("2026-03-01", "2026-03-05")

    expect(range).not.toBeNull()
    expect(range?.from.toISOString()).toBe("2026-03-01T00:00:00.000Z")
    expect(range?.to.toISOString()).toBe("2026-03-05T23:59:59.999Z")
  })

  test("rejects inverted ranges", () => {
    expect(getDateRange("2026-03-10", "2026-03-01")).toBeNull()
  })

  test("rejects invalid calendar dates", () => {
    expect(getDateRange("2026-02-31", "2026-03-01")).toBeNull()
  })
})

describe("fillMissingDailyStats", () => {
  test("fills missing UTC days with zero values", () => {
    const range = getDateRange("2026-03-01", "2026-03-03")

    expect(range).not.toBeNull()
    expect(fillMissingDailyStats(range!, [
      {
        date: "2026-03-01",
        promptTokens: 100,
        completionTokens: 50,
        reviewCount: 1,
        estimatedCostUsd: 0.00125,
      },
      {
        date: "2026-03-03",
        promptTokens: 80,
        completionTokens: 20,
        reviewCount: 1,
        estimatedCostUsd: 0.0007,
      },
    ])).toEqual([
      {
        date: "2026-03-01",
        promptTokens: 100,
        completionTokens: 50,
        reviewCount: 1,
        estimatedCostUsd: 0.00125,
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
        promptTokens: 80,
        completionTokens: 20,
        reviewCount: 1,
        estimatedCostUsd: 0.0007,
      },
    ])
  })
})

describe("getProviderFilter", () => {
  test("defaults to all", () => {
    expect(getProviderFilter(undefined)).toBe("all")
  })

  test("accepts known providers", () => {
    expect(getProviderFilter("openai")).toBe("openai")
    expect(getProviderFilter("anthropic")).toBe("anthropic")
    expect(getProviderFilter("gemini")).toBe("gemini")
  })

  test("rejects invalid providers", () => {
    expect(getProviderFilter("ollama")).toBeNull()
  })
})

describe("getModelFilter", () => {
  test("accepts trimmed models", () => {
    expect(getModelFilter(" gpt-4o ")).toBe("gpt-4o")
  })

  test("rejects empty or oversized models", () => {
    expect(getModelFilter("   ")).toBeNull()
    expect(getModelFilter("x".repeat(101))).toBeNull()
  })
})

describe("getReviewStatusFilter", () => {
  test("defaults to all", () => {
    expect(getReviewStatusFilter(undefined)).toBe("all")
  })

  test("accepts known statuses", () => {
    expect(getReviewStatusFilter("completed")).toBe("completed")
    expect(getReviewStatusFilter("failed")).toBe("failed")
    expect(getReviewStatusFilter("pending")).toBe("pending")
    expect(getReviewStatusFilter("processing")).toBe("processing")
    expect(getReviewStatusFilter("all")).toBe("all")
  })

  test("rejects invalid statuses", () => {
    expect(getReviewStatusFilter("done")).toBeNull()
    expect(getReviewStatusFilter(123)).toBeNull()
  })
})

describe("getPagination", () => {
  test("uses default pagination when params are omitted", () => {
    expect(getPagination(undefined, undefined)).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
    })
  })

  test("caps limit at 100", () => {
    expect(getPagination("2", "999")).toEqual({
      page: 2,
      limit: 100,
      offset: 100,
    })
  })

  test("rejects invalid values", () => {
    expect(getPagination("0", "20")).toBeNull()
    expect(getPagination("1", "0")).toBeNull()
    expect(getPagination("abc", "20")).toBeNull()
  })
})
