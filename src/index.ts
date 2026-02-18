import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { resolve } from "path";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadConfig } from "./config.js";
import { githubWebhookHandler } from "./api/webhooks/github.js";
import { authRoutes } from "./api/auth.js";
import { installationsRoutes } from "./api/installations.js";
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

async function main() {
    const config = loadConfig();
    const FRONTEND_DIR = process.env.NODE_ENV === "production"
        ? resolve(process.cwd(), "frontend/dist")
        : resolve(import.meta.dir, "../frontend/dist");

    logger.info(`Frontend directory: ${FRONTEND_DIR}`);

    const app = new Elysia()
        .use(cors())
        .use(githubWebhookHandler)
        .use(authRoutes)
        .use(installationsRoutes)
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
        .get("/metrics", async ({ set }) => {
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

                const queueStats = await getQueueStats();

                return {
                    reviews: {
                        total: totalReviews[0]?.count ?? 0,
                        failed: failedReviews[0]?.count ?? 0,
                        avgDurationMs: Math.round(avgDuration[0]?.avg ?? 0),
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
