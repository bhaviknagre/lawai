import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

function client() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  // Reuse one pool across hot reloads in dev; serverless platforms get a small pool.
  globalForDb.pg ??= postgres(process.env.DATABASE_URL, {
    max: process.env.NODE_ENV === "production" ? 5 : 10,
    prepare: false, // required for PgBouncer / Supabase / Neon pooled URLs
  });
  return globalForDb.pg;
}

export const db = drizzle({ client: client(), schema, casing: "snake_case" });
export { schema };
