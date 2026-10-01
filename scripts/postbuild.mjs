// Next's standalone output doesn't include static assets; copy them in so `npm start` works.
import { cpSync, existsSync } from "node:fs";
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
console.log("✓ standalone bundle ready (.next/standalone)");
