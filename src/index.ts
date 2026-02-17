import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { resolve } from "path";
import { eq, sql } from "drizzle-orm";
import { loadConfig } from "./config.js";
import { githubWebhookHandler } from "./api/webhooks/github.js";
import { settingsRoutes } from "./api/settings.js";
import { startQueue, stopQueue, getQueueStats } from "./review/pipeline.js";
import { getDb } from "./db/index.js";
import { reviews } from "./db/schema.js";
import { logger } from "./logger.js";

const config = loadConfig();
const FRONTEND_DIR = resolve(import.meta.dir, "../frontend/dist");

async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}


const app = new Elysia()
  .use(cors())
  .use(githubWebhookHandler)
  .use(settingsRoutes)
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
    return new Response(Bun.file(resolve(FRONTEND_DIR, "assets", params["*"])));
  })
  .get("/", () => {
    return new Response(Bun.file(resolve(FRONTEND_DIR, "index.html")), {
      headers: { "Content-Type": "text/html" },
    });
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

export type App = typeof app;
