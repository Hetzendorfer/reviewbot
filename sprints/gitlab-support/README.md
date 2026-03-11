# Sprint: GitLab Support

## Goal
Add GitLab as a supported platform alongside GitHub, allowing ReviewBot to review Merge Requests on GitLab repositories with the same LLM-powered review capabilities.

## Status
- `Unvollständig`
- `Verschoben`: GitLab support wird in einem späteren Sprint umgesetzt
- Dieser Plan bleibt als Entwurf bestehen und ist aktuell nicht in aktiver Umsetzung

## Background
The codebase is currently tightly coupled to GitHub across auth, webhooks, the review pipeline, the poster, the DB schema, and the frontend. However, the LLM layer, diff parser, queue, and review logic are already platform-agnostic. The strategy is to:
1. Define platform abstraction interfaces
2. Refactor existing GitHub code behind those interfaces
3. Implement GitLab as a second platform
4. Update the DB schema and frontend for multi-platform support

## Key Architectural Differences: GitHub vs GitLab
| Concept | GitHub | GitLab |
|---------|--------|--------|
| Auth model | GitHub App (JWT + installation tokens) | OAuth Application + Project/Group Access Tokens |
| Code review unit | Pull Request | Merge Request |
| Inline comments | `pulls.createReview` with `comments[]` | `POST /projects/:id/merge_requests/:iid/discussions` |
| Status checks | Check Runs API (rich lifecycle) | Commit Statuses API (simpler: pending/running/success/failed) |
| Webhook auth | HMAC-SHA256 (`x-hub-signature-256`) | Secret token header (`X-Gitlab-Token`) |
| Installation concept | App installed on org/user | Webhook configured per project/group |
| Diff fetching | `pulls.get` with `Accept: diff` media type | `GET /projects/:id/merge_requests/:iid/diffs` |
| File content | `repos.getContent` | `GET /projects/:id/repository/files/:path/raw` |

## Scope
- Platform abstraction layer with interfaces for auth, client, webhooks, and status reporting
- GitLab OAuth flow for user authentication
- GitLab webhook handler for MR events
- GitLab client for fetching diffs and posting review comments
- GitLab commit status integration (as alternative to GitHub Check Runs)
- DB schema migration to support multi-platform installations
- Frontend updates for GitLab login and installation management

## Acceptance Criteria
- [ ] GitLab MR events trigger automated reviews
- [ ] Reviews are posted as inline discussions on GitLab MRs
- [ ] Commit status is updated on GitLab (pending → running → success/failed)
- [ ] Users can log in with GitLab OAuth
- [ ] Users can configure GitLab installations with LLM settings
- [ ] Existing GitHub functionality is unaffected (no regressions)
- [ ] `.reviewbot.yml` repo config works on GitLab repos

## Tickets
| ID | Title | Effort |
|----|-------|--------|
| GL-01 | Define platform abstraction interfaces | M |
| GL-02 | Refactor GitHub code into platform module | L |
| GL-03 | DB schema migration (multi-platform support) | M |
| GL-04 | Implement GitLab OAuth authentication | M |
| GL-05 | Implement GitLab client (diffs, comments, file content) | L |
| GL-06 | Implement GitLab webhook handler | M |
| GL-07 | Refactor review pipeline to use platform interfaces | L |
| GL-08 | Frontend: Multi-platform support in UI | L |
| GL-09 | Config: Add GitLab environment variables | S |
| GL-10 | Testing: Integration tests for GitLab flow | L |

Effort: S = small (< 2h), M = medium (2-4h), L = large (4-8h)

## Dependencies
- Token Monitoring sprint should be completed first (to avoid conflicting schema migrations)

## Risks
- GitLab's inline comment API uses "discussions" which are structurally different from GitHub's review comments — line mapping may need special handling for multi-line diffs
- Self-hosted GitLab instances may have API differences or version-specific behavior
- GitLab has no direct equivalent of GitHub App "installations" — the project/group webhook model is fundamentally different and may require a different mental model in the UI
