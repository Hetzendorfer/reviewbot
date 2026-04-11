# Out Of Scope For This Branch

This branch is staying focused on low-risk hardening around review queuing, webhook filtering, and retry behavior. The items below should still be fixed, but they are intentionally deferred because they need broader design or wider test coverage than this branch should absorb.

## Deferred Follow-Ups

- OpenAI model validation and curated model defaults, including support for OpenAI-compatible open-source backends.
- Secret rotation and re-encryption support for `ENCRYPTION_KEY`.
- Parser hardening with structured output or a stronger fallback path.
- Externalizing model pricing data from `src/monitoring/pricing.ts`.
- Broader integration coverage for the queue, webhook handler, review pipeline, and auth flow.

## Why These Are Deferred

- They cross multiple subsystems and would broaden the branch beyond a focused hardening pass.
- Several of them need migration or configuration design before code changes are safe.
- They should be tackled together with a dedicated test plan so behavior changes stay visible.
