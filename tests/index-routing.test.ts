import { describe, expect, test } from "bun:test";
import { createApp, shouldServeSpaFallback } from "../src/index.js";

const frontendFixtureDir = `${process.cwd()}/tests/fixtures/frontend`;

describe("shouldServeSpaFallback", () => {
  test("uses the SPA fallback for browser GET navigation only", () => {
    expect(
      shouldServeSpaFallback(
        new Request("http://localhost/settings/123", {
          headers: { accept: "text/html,application/xhtml+xml" },
        })
      )
    ).toBe(true);

    expect(
      shouldServeSpaFallback(
        new Request("http://localhost/api/missing", {
          headers: { accept: "text/html,application/xhtml+xml" },
        })
      )
    ).toBe(false);
  });
});

describe("createApp not-found handling", () => {
  test("returns JSON 404 for unknown API routes", async () => {
    const app = createApp(frontendFixtureDir);
    const response = await app.handle(
      new Request("http://localhost/api/missing", {
        headers: { accept: "application/json" },
      })
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  test("serves index.html for unknown browser routes", async () => {
    const app = createApp(frontendFixtureDir);
    const response = await app.handle(
      new Request("http://localhost/settings/123", {
        headers: { accept: "text/html,application/xhtml+xml" },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("SPA fixture");
  });
});
