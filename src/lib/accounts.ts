import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { firms, sessions, userTokens, users } from "@/db/schema";
import type { Role } from "./permissions";
import { linkEmail, sendEmail } from "./email";

export { type Role } from "./permissions";
export const ROLES = ["admin", "attorney", "paralegal"] as const satisfies readonly Role[];
export const ROLE_LABELS: Record<Role, string> = { admin: "Admin", attorney: "Associate", paralegal: "Paralegal" };
const DEFAULT_TITLES: Record<Role, string> = { admin: "Senior Attorney", attorney: "Associate", paralegal: "Paralegal" };
const DEFAULT_HOURS: Record<Role, number> = { admin: 32, attorney: 35, paralegal: 20 };
const COLORS = ["#2A3858", "#146B42", "#9A3A06", "#5B3FA6", "#0F6B6B", "#8A2D52", "#3D5A80", "#7A5C00"];

/** Invite and reset links stay valid for 48 hours and work once. */
export const LINK_TTL_HOURS = 48;
export const MIN_PASSWORD = 10;
export const SUSPENDED_MESSAGE = "Your firm's LawAI access is paused. Please contact your firm's admin.";

export const personSchema = z.object({
  name: z.string().trim().min(2, "Enter the person's full name."),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  role: z.enum(ROLES),
  title: z.string().trim().optional().transform((v) => v || undefined),
});

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Public base URL for links: APP_URL, else Vercel's production domain, else local dev. */
export function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export async function emailTaken(email: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return !!row;
}

type Tx = Pick<typeof db, "insert" | "delete" | "update">;

/** Replaces any earlier unused link for this person, so only the newest one works. */
export async function issueLink(userId: string, purpose: "invite" | "reset", createdBy: string | null, tx: Tx = db) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_TTL_HOURS * 36e5);
  await tx.delete(userTokens).where(and(eq(userTokens.userId, userId), isNull(userTokens.usedAt)));
  await tx.insert(userTokens).values({ id: sha256(token), userId, purpose, expiresAt, createdBy });
  return { url: `${appUrl()}/invite/${token}`, expiresAt };
}

/**
 * Creates someone who can't sign in until they open their invite link and choose a password.
 * Nobody, including the person who invited them, ever sees or sets their password.
 */
export async function createAccount(input: z.infer<typeof personSchema> & { firmId: string }, createdBy: string | null, tx: Tx = db) {
  const [user] = await tx
    .insert(users)
    .values({
      firmId: input.firmId,
      name: input.name,
      email: input.email,
      passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
      role: input.role,
      title: input.title ?? DEFAULT_TITLES[input.role],
      weeklyTargetHours: DEFAULT_HOURS[input.role],
      color: COLORS[randomBytes(1)[0]! % COLORS.length]!,
      activatedAt: null,
    })
    .returning();
  const link = await issueLink(user!.id, "invite", createdBy, tx);
  return { user: user!, link };
}

/** Admin-issued reset: the old password stops working at once and the person picks a new one via the link. */
export async function issueReset(userId: string, createdBy: string) {
  await db.update(users).set({ passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10) }).where(eq(users.id, userId));
  return issueLink(userId, "reset", createdBy);
}

/** The link's token and its person, if the link is unused, unexpired and the person is active. */
export async function findLink(token: string) {
  const [row] = await db
    .select({ token: userTokens, user: users, firm: { name: firms.name, suspendedAt: firms.suspendedAt } })
    .from(userTokens)
    .innerJoin(users, eq(users.id, userTokens.userId))
    .innerJoin(firms, eq(firms.id, users.firmId))
    .where(and(eq(userTokens.id, sha256(token)), isNull(userTokens.usedAt), gt(userTokens.expiresAt, new Date()), isNull(users.deactivatedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Emails a freshly issued link to its person. Returns whether it went out, so the screen can say
 * "emailed" or fall back to showing the link for the sender to pass on.
 */
export async function deliverLink(user: { id: string; name: string; email: string; firmId: string }, link: { url: string; expiresAt: Date }, kind: "invite" | "reset", invitedBy?: string | null) {
  const [firm] = await db.select({ name: firms.name }).from(firms).where(eq(firms.id, user.firmId)).limit(1);
  const r = await sendEmail({
    ...linkEmail({ name: user.name, email: user.email, firmName: firm?.name ?? "your firm", url: link.url, expiresAt: link.expiresAt, kind, invitedBy }),
    idempotencyKey: `${kind}-${user.id}-${link.expiresAt.getTime()}`,
  });
  return { emailed: r.sent, emailNote: r.sent ? undefined : r.reason };
}

/** Sets the password, marks the link used and activates the account, all at once. */
export async function redeemLink(token: string, password: string) {
  const found = await findLink(token);
  if (!found) return null;
  if (found.firm.suspendedAt) return "suspended" as const;
  const hash = await bcrypt.hash(password, 10);
  await db.transaction(async (tx) => {
    await tx.update(userTokens).set({ usedAt: new Date() }).where(eq(userTokens.id, found.token.id));
    await tx.delete(sessions).where(eq(sessions.userId, found.user.id));
    await tx
      .update(users)
      .set({ passwordHash: hash, activatedAt: found.user.activatedAt ?? new Date() })
      .where(eq(users.id, found.user.id));
  });
  return { user: found.user, purpose: found.token.purpose, firmName: found.firm.name };
}

/** URL-safe firm slug from its name, e.g. "Patel & Associates" → "patel-associates". */
export function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "firm";
}

/** Result shape for forms that hand back a one-time link to pass on. */
export type LinkState = {
  error?: string;
  ok?: boolean;
  link?: { name: string; email: string; url: string; expiresAt: string; kind: "invite" | "reset"; emailed: boolean; emailNote?: string };
} | null;
