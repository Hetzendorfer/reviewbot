Project Structure (27 files)                                                                             
                                                                                                           
  - Foundation: package.json, tsconfig.json, .env.example, Drizzle config + migration
  - Config: Zod-validated env loading (src/config.ts)                                                      
  - Crypto: AES-256-GCM encrypt/decrypt for API keys at rest (src/crypto.ts)                               
  - Database: 3 tables via Drizzle ORM — installations, installation_settings, reviews (src/db/)
  - GitHub Integration: JWT auth with token caching, webhook signature verification, diff fetching, review
  posting (src/github/)
  - LLM Providers: Pluggable interface with OpenAI, Anthropic, and Gemini implementations (src/llm/)
  - Review Pipeline: Diff parsing/chunking → LLM call → structured comment parsing → GitHub review posting,
   with an in-process async queue (concurrency=3) (src/review/, src/queue.ts)
  - Settings API: GET/PUT /api/settings/:installationId with encrypted key storage (src/api/settings.ts)
  - Repo Config: .reviewbot.yml fetching and merging with DB settings (src/repo-config.ts)
  - Frontend: Preact settings page with provider/model selection, API key input, review style config
  (frontend/)
  - Docker: Multi-stage Dockerfile + Compose with PostgreSQL

  To get started:

  1. Copy .env.example to .env and fill in GitHub App credentials + encryption key
  2. docker compose up to start the app + database
  3. Run the migration: the SQL is in drizzle/0000_initial.sql
  4. Install the GitHub App on a repo, configure settings at http://localhost:3000?installation_id=<ID>


  Creating a GitHub App                                                                                    
                                                                                                           
  1. Go to GitHub Settings > Developer settings > GitHub Apps > New GitHub App
  (direct link: https://github.com/settings/apps/new)                                                      
  2. Fill in the form:                                            
    - Name: reviewbot (or whatever you like)                                                               
    - Homepage URL: your server URL (e.g. http://localhost:3000)  
    - Webhook URL: https://<your-domain>/webhooks/github
    - Webhook secret: generate one (openssl rand -hex 20) — this is your GITHUB_WEBHOOK_SECRET
  3. Set permissions:
    - Repository > Pull requests: Read & Write
    - Repository > Contents: Read-only
  4. Subscribe to events:
    - Check Pull request
  5. Click Create GitHub App
  6. On the app's settings page, note the App ID — this is your GITHUB_APP_ID
  7. Scroll down to Private keys and click Generate a private key. A .pem file downloads. Base64-encode it
  for your env:
  cat your-app.2024-01-01.private-key.pem | base64 | tr -d '\n'
  7. That output is your GITHUB_PRIVATE_KEY.
  8. Generate your encryption key:
  openssl rand -hex 32
  8. That's your ENCRYPTION_KEY.
  9. Install the app on a repo by going to https://github.com/apps/<your-app-name>/installations/new and
  selecting the repos you want.

  After installation, GitHub redirects you with an installation_id query param — use that to configure
  settings at http://localhost:3000?installation_id=<ID>.