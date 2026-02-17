# Deployment Checklist

## Pre-Deployment

1. [ ] Run all tests: `bun test`
2. [ ] Type check: `bunx tsc --noEmit`
3. [ ] Build frontend: `bun run build:frontend`
4. [ ] Test locally: `docker compose up --build`

## Environment Variables

Ensure these are set in Coolify:

- `GITHUB_APP_ID` - From GitHub App settings
- `GITHUB_PRIVATE_KEY` - Base64 encoded private key
- `GITHUB_WEBHOOK_SECRET` - Webhook secret
- `ENCRYPTION_KEY` - 64-char hex string (openssl rand -hex 32)
- `POSTGRES_PASSWORD` - Database password
- `LOG_LEVEL` - Set to "info" or "debug"

## GitHub App Configuration

1. [ ] Webhook URL points to your Coolify domain
2. [ ] Permissions set: Pull requests (Read & Write), Contents (Read), Checks (Read & Write)
3. [ ] Events subscribed: Pull request

## Post-Deployment

1. [ ] Check health endpoint: `curl https://your-domain/health`
2. [ ] Check logs for errors
3. [ ] Test webhook: Open a PR on a test repo
4. [ ] Verify Check Run appears on PR
5. [ ] Verify review is posted

## Rollback

If issues occur:
1. Revert to previous Docker image
2. Check database migrations haven't broken schema
3. Review logs for error patterns
