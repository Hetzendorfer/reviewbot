import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { resolve } from "path";
import { loadConfig } from "./config.js";
import { githubWebhookHandler } from "./api/webhooks/github.js";
import { settingsRoutes } from "./api/settings.js";

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

export type App = typeof app;
