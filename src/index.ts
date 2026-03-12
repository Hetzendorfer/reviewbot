import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { timingSafeEqual } from "crypto";
import { resolve } from "path";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadConfig } from "./config.js";
import { githubWebhookHandler } from "./api/webhooks/github.js";
import { authRoutes } from "./api/auth.js";
import { installationsRoutes } from "./api/installations.js";
import { statsRoutes } from "./api/stats.js";
import { startQueue, stopQueue, getQueueStats } from "./review/pipeline.js";
import { getDb } from "./db/index.js";
import { reviews } from "./db/schema.js";
import { logger } from "./logger.js";

async function runMigrations(): Promise<void> {
    const config = loadConfig();
    const client = postgres(config.DATABASE_URL, { max: 1 });
    const db = drizzle(client);

    logger.info("Running database migrations...");

    await migrate(db, { migrationsFolder: "./drizzle" });

    await client.end();
    logger.info("Migrations complete");
}

async function checkDatabaseConnection(): Promise<boolean> {
    try {
        const db = getDb();
        await db.execute(sql`SELECT 1`);
        return true;
    } catch {
        return false;
    }
}

function extractBearerToken(authHeader: string | null): string | null {
    if (!authHeader) return null;
    const [scheme, token, ...rest] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token || rest.length > 0) return null;
    return token;
}

function verifyMetricsToken(
    authHeader: string | null,
    expectedToken: string,
): boolean {
    const providedToken = extractBearerToken(authHeader);
    if (!providedToken) return false;

    const provided = Buffer.from(providedToken, "utf-8");
    const expected = Buffer.from(expectedToken, "utf-8");
    if (provided.length !== expected.length) return false;

    return timingSafeEqual(provided, expected);
}

async function main() {
    const config = loadConfig();
    const FRONTEND_DIR = process.env.NODE_ENV === "production"
        ? resolve(process.cwd(), "frontend/dist")
        : resolve(import.meta.dir, "../frontend/dist");

    logger.info(`Frontend directory: ${FRONTEND_DIR}`);
    if (!config.METRICS_TOKEN) {
        logger.warn("METRICS_TOKEN not set: /metrics endpoint disabled");
    }

    const app = new Elysia()
        .use(cors())
        .use(githubWebhookHandler)
        .use(authRoutes)
        .use(installationsRoutes)
        .use(statsRoutes)
        .get("/health", async () => {
            const dbOk = await checkDatabaseConnection();
            const queueStats = await getQueueStats();

            const status = dbOk ? "ok" : "degraded";

            return {
                status,
                database: dbOk,
                queue: queueStats,
                uptime: Math.floor(process.uptime()),
                timestamp: new Date().toISOString(),
            };
        })
        .get("/metrics", async ({ set, request }) => {
            if (!config.METRICS_TOKEN) {
                set.status = process.env.NODE_ENV === "production" ? 404 : 503;
                return { error: "Metrics unavailable" };
            }

            if (
                !verifyMetricsToken(
                    request.headers.get("authorization"),
                    config.METRICS_TOKEN,
                )
            ) {
                set.status = 401;
                return { error: "Unauthorized" };
            }

            try {
                const db = getDb();

                const totalReviews = await db
                    .select({ count: sql<number>`count(*)` })
                    .from(reviews);

                const failedReviews = await db
                    .select({ count: sql<number>`count(*)` })
                    .from(reviews)
                    .where(eq(reviews.status, "failed"));

                const avgDuration = await db
                    .select({ avg: sql<number>`avg(duration_ms)` })
                    .from(reviews)
                    .where(sql`duration_ms IS NOT NULL`);

                const [tokenTotals] = await db
                    .select({
                        promptTokens: sql<number>`coalesce(sum(prompt_tokens), 0)`,
                        completionTokens: sql<number>`coalesce(sum(completion_tokens), 0)`,
                    })
                    .from(reviews)
                    .where(eq(reviews.status, "completed"));

                const queueStats = await getQueueStats();

                const totalPromptTokens = tokenTotals?.promptTokens ?? 0;
                const totalCompletionTokens = tokenTotals?.completionTokens ?? 0;

                return {
                    reviews: {
                        total: totalReviews[0]?.count ?? 0,
                        failed: failedReviews[0]?.count ?? 0,
                        avgDurationMs: Math.round(avgDuration[0]?.avg ?? 0),
                    },
                    tokens: {
                        totalPromptTokens,
                        totalCompletionTokens,
                        totalTokens: totalPromptTokens + totalCompletionTokens,
                    },
                    queue: queueStats,
                };
            } catch {
                set.status = 503;
                return { error: "Metrics unavailable" };
            }
        })
        .get("/assets/*", ({ params }) => {
            const file = Bun.file(resolve(FRONTEND_DIR, "assets", params["*"]));

            return new Response(file, {
                headers: { "Content-Type": file.type },
            });
        })
        .get("/", () => {
            const indexPath = resolve(FRONTEND_DIR, "index.html");
            return new Response(Bun.file(indexPath), {
                headers: { "Content-Type": "text/html" },
            });
        })
        .onError(({ code, error, set }) => {
            if (code === "NOT_FOUND") {
                const indexPath = resolve(FRONTEND_DIR, "index.html");
                return new Response(Bun.file(indexPath), {
                    headers: { "Content-Type": "text/html" },
                });
            }
            logger.error("Server error", { code, error: String(error) });
            set.status = 500;
            return { error: "Internal server error" };
        })
        .listen({
            port: config.PORT,
            hostname: config.HOST,
        });

    logger.info(`ReviewBot running at http://${config.HOST}:${config.PORT}`);

    startQueue();

    let isShuttingDown = false;

    async function shutdown(signal: string) {
        if (isShuttingDown) return;
        isShuttingDown = true;

        logger.info(`Received ${signal}, shutting down gracefully`);

        app.stop();

        await stopQueue();

        logger.info("Shutdown complete");
        process.exit(0);
    }

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    return app;
}

runMigrations()
    .then(() => main())
    .catch((err) => {
        logger.error("Failed to start", { error: String(err) });
        process.exit(1);
    });

export type App = Awaited<ReturnType<typeof main>>;
