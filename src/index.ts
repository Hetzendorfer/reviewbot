import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { resolve } from "path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadConfig } from "./config.js";
import { githubWebhookHandler } from "./api/webhooks/github.js";
import { authRoutes } from "./api/auth.js";
import { installationsRoutes } from "./api/installations.js";
import { metricsRoutes } from "./api/metrics.js";
import { statsRoutes } from "./api/stats.js";
import { diagnosticsRoutes } from "./api/diagnostics.js";
import { startQueue, stopQueue, getQueueStats } from "./review/pipeline.js";
import { getDb } from "./db/index.js";
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

function getFrontendDir(): string {
    return process.env.NODE_ENV === "production"
        ? resolve(process.cwd(), "frontend/dist")
        : resolve(import.meta.dir, "../frontend/dist");
}

export function shouldServeSpaFallback(request: Request): boolean {
    if (request.method !== "GET") {
        return false;
    }

    const url = new URL(request.url);
    if (
        url.pathname === "/api" ||
        url.pathname.startsWith("/api/") ||
        url.pathname === "/webhooks" ||
        url.pathname.startsWith("/webhooks/") ||
        url.pathname.startsWith("/assets/")
    ) {
        return false;
    }

    const accept = request.headers.get("accept") ?? "";
    return accept.includes("text/html");
}

export function createApp(frontendDir = getFrontendDir()) {
    return new Elysia()
        .use(cors())
        .use(githubWebhookHandler)
        .use(authRoutes)
        .use(installationsRoutes)
        .use(metricsRoutes)
        .use(statsRoutes)
        .use(diagnosticsRoutes)
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
        .get("/assets/*", ({ params }) => {
            const file = Bun.file(resolve(frontendDir, "assets", params["*"]));

            return new Response(file, {
                headers: { "Content-Type": file.type },
            });
        })
        .get("/", () => {
            const indexPath = resolve(frontendDir, "index.html");
            return new Response(Bun.file(indexPath), {
                headers: { "Content-Type": "text/html" },
            });
        })
        .onError(({ code, error, request, set }) => {
            if (code === "NOT_FOUND") {
                if (shouldServeSpaFallback(request)) {
                    const indexPath = resolve(frontendDir, "index.html");
                    return new Response(Bun.file(indexPath), {
                        headers: { "Content-Type": "text/html" },
                    });
                }

                set.status = 404;
                return { error: "Not found" };
            }
            logger.error("Server error", { code, error: String(error) });
            set.status = 500;
            return { error: "Internal server error" };
        });
}

async function main() {
    const config = loadConfig();
    const FRONTEND_DIR = getFrontendDir();

    logger.info(`Frontend directory: ${FRONTEND_DIR}`);
    if (!config.METRICS_TOKEN) {
        logger.warn("METRICS_TOKEN not set: /metrics endpoint disabled");
    }

    await startQueue();

    const app = createApp(FRONTEND_DIR)
        .listen({
            port: config.PORT,
            hostname: config.HOST,
        });

    logger.info(`ReviewBot running at http://${config.HOST}:${config.PORT}`);

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

if (import.meta.main) {
    runMigrations()
        .then(() => main())
        .catch((err) => {
            logger.error("Failed to start", { error: String(err) });
            process.exit(1);
        });
}

export type App = Awaited<ReturnType<typeof main>>;
