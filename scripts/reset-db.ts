import "dotenv/config";
import postgres from "postgres";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database.");
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
console.log("✓ database wiped");
await sql.end();
