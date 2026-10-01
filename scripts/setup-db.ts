import "dotenv/config";
import postgres from "postgres";

// Extensions must exist before drizzle-kit creates vector / tsvector columns.
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
await sql`CREATE EXTENSION IF NOT EXISTS vector`;
await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
console.log("✓ extensions ready (vector, pgcrypto)");
await sql.end();
