# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./
COPY frontend/package.json frontend/bun.lock* frontend/

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

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

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
