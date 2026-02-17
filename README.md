# ReviewBot

GitHub App that performs automated PR reviews using LLMs.

## Project Structure

- **Foundation**: package.json, tsconfig.json, .env.example, Drizzle config + migration
- **Config**: Zod-validated env loading (src/config.ts)
- **Crypto**: AES-256-GCM encrypt/decrypt for API keys at rest (src/crypto.ts)
- **Database**: 4 tables via Drizzle ORM — installations, installation_settings, reviews, review_jobs (src/db/)
- **GitHub Integration**: JWT auth, webhook signature verification, diff fetching, review posting (src/github/)
- **LLM Providers**: Pluggable interface with OpenAI, Anthropic, and Gemini implementations (src/llm/)
- **Review Pipeline**: Diff parsing/chunking → LLM call → structured comment parsing → GitHub review posting (src/review/)
- **Persistent Queue**: PostgreSQL-backed job queue with crash recovery (src/queue.ts)
- **Settings API**: GET/PUT /api/settings/:installationId with encrypted key storage (src/api/settings.ts)
- **Frontend**: Preact settings page with provider/model selection, API key input, review style config (frontend/)
- **Docker**: Multi-stage Dockerfile + Compose with PostgreSQL

## Quick Start

1. Copy `.env.example` to `.env` and fill in GitHub App credentials + encryption key
2. `docker compose up` to start the app + database
3. Install the GitHub App on a repo, configure settings at `http://localhost:3000?installation_id=<ID>`

## Creating a GitHub App

1. Go to GitHub Settings > Developer settings > GitHub Apps > New GitHub App
   (direct link: https://github.com/settings/apps/new)
2. Fill in the form:
   - Name: reviewbot (or whatever you like)
   - Homepage URL: your server URL (e.g. http://localhost:3000)
   - Webhook URL: `https://<your-domain>/webhooks/github`
   - Webhook secret: generate one (`openssl rand -hex 20`) — this is your `GITHUB_WEBHOOK_SECRET`
3. Set permissions:
   - Repository > Pull requests: Read & Write
   - Repository > Contents: Read-only
   - Repository > Checks: Read & Write
4. Subscribe to events:
   - Check Pull request
5. Click Create GitHub App
6. On the app's settings page, note the App ID — this is your `GITHUB_APP_ID`
7. Scroll down to Private keys and click Generate a private key. A .pem file downloads. Base64-encode it:
   ```
   cat your-app.2024-01-01.private-key.pem | base64 | tr -d '\n'
   ```
   That output is your `GITHUB_PRIVATE_KEY`.
8. Generate your encryption key:
   ```
   openssl rand -hex 32
   ```
   That's your `ENCRYPTION_KEY`.
9. Install the app on a repo by going to `https://github.com/apps/<your-app-name>/installations/new`

After installation, GitHub redirects you with an `installation_id` query param — use that to configure settings at `http://localhost:3000?installation_id=<ID>`.

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
{"timestamp":"...","level":"info","message":"Review completed","repo":"owner/repo","pr":42,"durationMs":5400}
```

Set `LOG_LEVEL=debug` for verbose output during troubleshooting.

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check with DB status, queue stats, uptime |
| `GET /metrics` | Review counts, average duration, queue depth |
| `GET /api/settings/:id` | Get installation settings |
| `PUT /api/settings/:id` | Update installation settings |
| `POST /webhooks/github` | GitHub webhook handler |

## Development

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Start frontend dev server
bun run dev:frontend

# Run tests
bun test

# Type check
bunx tsc --noEmit

# Generate migration
bun run db:generate

# Run migration
bun run db:migrate
```
