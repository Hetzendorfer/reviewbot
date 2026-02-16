import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { loadConfig } from "./config.js";
import { githubWebhookHandler } from "./api/webhooks/github.js";
import { settingsRoutes } from "./api/settings.js";

const config = loadConfig();

const app = new Elysia()
  .use(cors())
  .use(
    staticPlugin({
      assets: "frontend/dist",
      prefix: "/",
    })
  )
  .use(githubWebhookHandler)
  .use(settingsRoutes)
  .get("/health", () => ({ status: "ok" }))
  .listen({
    port: config.PORT,
    hostname: config.HOST,
  });

console.log(`ReviewBot running at http://${config.HOST}:${config.PORT}`);

export type App = typeof app;
