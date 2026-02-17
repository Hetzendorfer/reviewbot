import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { resolve } from "path";
import { loadConfig } from "./config.js";
import { githubWebhookHandler } from "./api/webhooks/github.js";
import { settingsRoutes } from "./api/settings.js";
import { startQueue, stopQueue } from "./review/pipeline.js";

const config = loadConfig();
const FRONTEND_DIR = resolve(import.meta.dir, "../frontend/dist");

const app = new Elysia()
  .use(cors())
  .use(githubWebhookHandler)
  .use(settingsRoutes)
  .get("/health", () => ({ status: "ok" }))
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

console.log(`ReviewBot running at http://${config.HOST}:${config.PORT}`);

startQueue();

let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`Received ${signal}, shutting down gracefully...`);

  app.stop();

  await stopQueue();

  console.log("Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export type App = typeof app;
