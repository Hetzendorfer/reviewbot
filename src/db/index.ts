import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { loadConfig } from "../config.js";

let _db: ReturnType<typeof createDb> | null = null;

function createDb() {
  const config = loadConfig();
  const client = postgres(config.DATABASE_URL);
  return drizzle(client, { schema });
}

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export type Db = ReturnType<typeof getDb>;
