# Iteration 5: Deployment Preparation

**Goal:** Final polish and deployment to Coolify.

**Estimated Time:** 1 hour

**Priority:** Low - final checks before production.

**Depends on:** Iteration 1, 2, 3, 4

---

## Tasks

### 5.1 Update Dockerfile

**File:** `Dockerfile`

Ensure it includes all improvements:

```dockerfile
# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./
COPY frontend/package.json frontend/bun.lockb ./frontend/

# Install dependencies
RUN bun install --frozen-lockfile
RUN bun install --frozen-lockfile --cwd frontend

# Copy source
COPY . .

# Build frontend
RUN bun run build:frontend

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy built frontend and backend
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/drizzle.config.ts ./

# Environment
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Expose port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start
CMD ["bun", "run", "src/index.ts"]
```

---

### 5.2 Update docker-compose.yml

**File:** `docker-compose.yml`

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - GITHUB_APP_ID=${GITHUB_APP_ID}
      - GITHUB_PRIVATE_KEY=${GITHUB_PRIVATE_KEY}
      - GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET}
      - DATABASE_URL=postgres://reviewbot:${POSTGRES_PASSWORD}@db:5432/reviewbot
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - PORT=3000
      - HOST=0.0.0.0
      - LOG_LEVEL=${LOG_LEVEL:-info}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=reviewbot
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=reviewbot
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U reviewbot"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

---

### 5.3 Update .env.example

**File:** `.env.example`

```env
# GitHub App
GITHUB_APP_ID=
GITHUB_PRIVATE_KEY=        # Base64 encoded .pem content
GITHUB_WEBHOOK_SECRET=

# Database
DATABASE_URL=postgres://reviewbot:reviewbot@localhost:5432/reviewbot
POSTGRES_PASSWORD=reviewbot

# Encryption (generate with: openssl rand -hex 32)
ENCRYPTION_KEY=

# Server
PORT=3000
HOST=0.0.0.0

# Logging
LOG_LEVEL=info

# Timeouts (optional)
LLM_TIMEOUT_MS=120000
GITHUB_TIMEOUT_MS=30000
```

---

### 5.4 Create Deployment Checklist

**File:** `DEPLOY.md` (new file)

```markdown
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
2. [ ] Permissions set: Pull requests (Read & Write), Contents (Read)
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
```

---

### 5.5 Add README Section for Production

**File:** `README.md`

Add section after existing content:

```markdown
## Production Deployment

### Requirements

- Docker and Docker Compose (or Coolify)
- PostgreSQL database
- GitHub App credentials

### Quick Start with Coolify

1. Fork this repository
2. Create new app in Coolify, connect to your fork
3. Set environment variables (see `.env.example`)
4. Deploy

The app will automatically:
- Run database migrations on startup
- Start the review queue
- Accept webhooks at `/webhooks/github`

### Health Monitoring

- `GET /health` - Basic health check with database status and queue stats
- `GET /metrics` - Review statistics and queue depth

### Logs

All logs are JSON formatted for easy parsing:

```json
{"timestamp":"...","level":"info","message":"Review completed","repo":"owner/repo","pr":42}
```

Set `LOG_LEVEL=debug` for verbose output during troubleshooting.
```

---

### 5.6 Final Testing Checklist

Before deploying to Coolify:

```bash
# 1. Run all tests
bun test

# 2. Type check
bunx tsc --noEmit

# 3. Build frontend
bun run build:frontend

# 4. Build Docker image
docker build -t reviewbot:test .

# 5. Run with test environment
docker compose up --build

# 6. Test health endpoint
curl http://localhost:3000/health

# 7. Test webhook (use ngrok or similar for local testing)
# - Create a test PR
# - Verify Check Run created
# - Verify review posted

# 8. Test crash recovery
# - Start a review
# - Kill container mid-review
# - Restart and verify job resumes
```

---

## Coolify-Specific Notes

### Resource Limits

Set in Coolify dashboard:
- Memory: 512MB minimum, 1GB recommended
- CPU: 0.5 cores minimum

### Persistent Storage

The database requires persistent storage. Ensure:
- PostgreSQL volume is configured
- Database backups are scheduled

### Environment Variables in Coolify

Add all variables from `.env.example` in Coolify's environment section. Mark sensitive values as secrets:
- `GITHUB_PRIVATE_KEY`
- `ENCRYPTION_KEY`
- `POSTGRES_PASSWORD`

### Webhook URL

In Coolify, your app will have a domain like:
```
https://reviewbot.yourcompany.com
```

Configure GitHub App webhook URL:
```
https://reviewbot.yourcompany.com/webhooks/github
```

---

## Post-Deployment Monitoring

After deployment, monitor:

1. **Health endpoint** - Set up uptime monitoring
2. **Logs** - Check for errors in first 24 hours
3. **Queue depth** - Watch for backlog in `/metrics`
4. **GitHub rate limits** - Ensure not hitting limits

---

## Rollback Procedure

If deployment fails:

1. In Coolify, deploy previous image
2. If database migration caused issue:
   ```bash
   # Connect to database
   psql $DATABASE_URL
   
   # Check migration table
   SELECT * FROM __drizzle_migrations;
   
   # If needed, manually rollback
   ```
3. Review logs to identify root cause
4. Fix issue and redeploy
