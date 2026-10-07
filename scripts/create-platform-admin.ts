/**
 * Makes someone a LawAI platform operator (can open /platform and onboard firms).
 * Run: npm run platform:admin -- you@lawai.app "Your Name"
 *  - existing user → gains platform access, keeps their firm and password
 *  - existing user + --reset → also prints a one-time link to choose a new password (for a forgotten operator password)
 *  - new email → created in the internal "LawAI Operations" firm; prints a one-time link to choose a password
 *    (uses APP_URL for the link, so set it to the deployed URL when running against production)
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { firms, sessions, users } from "../src/db/schema";
import { createAccount, issueReset } from "../src/lib/accounts";

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const [email = "", name = ""] = args.filter((a) => a !== "--reset").map((a) => a.trim());
if (!email.includes("@")) {
  console.error('Usage: npm run platform:admin -- <email> "<full name>"');
  process.exit(1);
}

const [existing] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
if (existing) {
  await db.update(users).set({ isPlatformAdmin: true, deactivatedAt: null }).where(eq(users.id, existing.id));
  console.log(`✓ ${existing.name} <${existing.email}> can now open /platform`);
  if (reset) {
    const link = await issueReset(existing.id, existing.id);
    await db.delete(sessions).where(eq(sessions.userId, existing.id));
    console.log(`  Old password disabled. Choose a new one here (works once, until ${link.expiresAt.toISOString()}):`);
    console.log(`  ${link.url}`);
  }
} else {
  if (name.length < 2) {
    console.error('New operator: pass their full name too, e.g. npm run platform:admin -- you@lawai.app "Your Name"');
    process.exit(1);
  }
  const [ops] = await db
    .insert(firms)
    .values({ name: "LawAI Operations", slug: "lawai-ops" })
    .onConflictDoUpdate({ target: firms.slug, set: { slug: "lawai-ops" } })
    .returning();
  const { user, link } = await createAccount({ firmId: ops!.id, name, email: email.toLowerCase(), role: "admin", title: "Platform Operator" }, null);
  await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, user.id));
  console.log(`✓ Created platform operator ${user.name} <${user.email}>`);
  console.log(`  Open this link to choose your password (works once, until ${link.expiresAt.toISOString()}):`);
  console.log(`  ${link.url}`);
}
process.exit(0);
