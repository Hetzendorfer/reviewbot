FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Build frontend
COPY frontend/package.json frontend/bun.lock* frontend/
RUN cd frontend && bun install
COPY frontend/ frontend/
RUN cd frontend && bun run build

# Copy source
COPY tsconfig.json drizzle.config.ts ./
COPY src/ src/
COPY drizzle/ drizzle/

EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
