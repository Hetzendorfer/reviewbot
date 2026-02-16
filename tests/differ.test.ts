import { describe, test, expect } from "bun:test";
import { parseDiff, chunkDiffs } from "../src/review/differ.js";

const SAMPLE_DIFF = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,6 @@
 import { Elysia } from "elysia";
+import { cors } from "@elysiajs/cors";

 const app = new Elysia()
+  .use(cors())
   .listen(3000);
diff --git a/package.json b/package.json
index 1111111..2222222 100644
--- a/package.json
+++ b/package.json
@@ -5,6 +5,7 @@
   "dependencies": {
     "elysia": "^1.0.0",
+    "@elysiajs/cors": "^1.0.0",
   }
 }
diff --git a/binary.png b/binary.png
Binary files differ
`;

describe("parseDiff", () => {
  test("parses multiple files from diff", () => {
    const files = parseDiff(SAMPLE_DIFF);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("src/index.ts");
    expect(files[1].path).toBe("package.json");
  });

  test("skips binary files", () => {
    const files = parseDiff(SAMPLE_DIFF);
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain("binary.png");
  });

  test("includes hunk content", () => {
    const files = parseDiff(SAMPLE_DIFF);
    expect(files[0].hunks).toContain("@@ -1,5 +1,6 @@");
    expect(files[0].hunks).toContain('+import { cors } from "@elysiajs/cors"');
  });

  test("handles empty diff", () => {
    expect(parseDiff("")).toEqual([]);
  });
});

describe("chunkDiffs", () => {
  test("puts small files in one chunk", () => {
    const files = parseDiff(SAMPLE_DIFF);
    const chunks = chunkDiffs(files, 100_000);
    expect(chunks).toHaveLength(1);
  });

  test("splits large diffs into multiple chunks", () => {
    const files = parseDiff(SAMPLE_DIFF);
    const chunks = chunkDiffs(files, 50); // very small limit
    expect(chunks.length).toBeGreaterThan(1);
  });
});
