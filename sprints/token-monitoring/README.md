# Sprint: Token Monitoring

## Goal
Give installation owners full visibility into their LLM token consumption, costs, and review activity through a backend API and frontend dashboard.

## Background
Token usage data is already collected by all three LLM providers and stored in the `reviews` table (`prompt_tokens`, `completion_tokens`, `llm_provider`, `llm_model`, `duration_ms`). However, this data is not exposed through any API endpoint and the frontend has no way to display it. The existing `/metrics` endpoint only returns review counts and average duration — no token data.

## Scope
- New authenticated API endpoints for per-installation token stats and review history
- Extend the existing `/metrics` endpoint with token aggregations
- Frontend dashboard components showing usage charts, cost estimates, and review history
- Tests for all new endpoints

## Acceptance Criteria
- [ ] Users can see total token usage (prompt + completion) per installation
- [ ] Users can filter usage by date range, provider, and model
- [ ] Users can see a list of past reviews with token counts and status
- [ ] Cost estimates are shown based on configurable per-model rates
- [ ] All new endpoints require authentication
- [ ] Frontend loads data with loading skeletons and error states

## Tickets
| ID | Title | Effort |
|----|-------|--------|
| TM-01 | Backend: Token usage stats API endpoint | M |
| TM-02 | Backend: Extend `/metrics` with token aggregations | S |
| TM-03 | Backend: Review history endpoint per installation | M |
| TM-04 | Frontend: TypeScript types for reviews & stats | S |
| TM-05 | Frontend: Usage dashboard component | L |
| TM-06 | Frontend: Review history table component | M |
| TM-07 | Testing: Endpoint and component tests | M |

Effort: S = small (< 2h), M = medium (2-4h), L = large (4-8h)

## Dependencies
- None — builds on existing data already in the DB

## Risks
- Token cost rates vary by model and change over time; cost estimates will need a maintainable rate config
- Large installations with many reviews may need pagination and query optimization
