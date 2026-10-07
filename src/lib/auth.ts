import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { firms, sessions, users } from "@/db/schema";
import { can, type Permission } from "./permissions";

export const SESSION_COOKIE = "lawai_session";
const SESSION_DAYS = 14;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** The user and whether their firm is suspended, or null when the email/password don't match. */
export async function verifyPassword(email: string, password: string) {
  const [row] = await db
    .select({ user: users, suspendedAt: firms.suspendedAt })
    .from(users)
    .innerJoin(firms, eq(firms.id, users.firmId))
    .where(and(eq(users.email, email.toLowerCase().trim()), isNull(users.deactivatedAt), isNotNull(users.activatedAt)))
    .limit(1);
  if (!row) {
    await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv"); // timing-safe
    return null;
  }
  return (await bcrypt.compare(password, row.user.passwordHash)) ? { user: row.user, firmSuspended: !!row.suspendedAt } : null;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

export type SessionUser = {
  id: string;
  firmId: string;
  firmName: string;
  firmJurisdictions: string[];
  name: string;
  email: string;
  role: "admin" | "attorney" | "paralegal";
  title: string;
  color: string;
  initials: string;
  isPlatformAdmin: boolean;
};

/** Current user, or null. Cached per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ user: users, firm: firms })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(firms, eq(firms.id, users.firmId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date()), isNull(users.deactivatedAt), isNull(firms.suspendedAt)))
    .limit(1);
  if (!row) return null;
  const { user, firm } = row;
  return {
    id: user.id,
    firmId: user.firmId,
    firmName: firm.name,
    firmJurisdictions: firm.jurisdictions,
    name: user.name,
    email: user.email,
    role: user.role,
    title: user.title,
    color: user.color,
    initials: initials(user.name),
    isPlatformAdmin: user.isPlatformAdmin,
  };
});

/** Use in pages and server actions. Redirects to /login when signed out. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** Pages a role can't open render the "Not found, or you don't have access" page. */
export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!can(user, permission)) notFound();
  return user;
}

/** LawAI operators only. 404s for everyone else so the console isn't discoverable. */
export async function requirePlatformAdmin() {
  const user = await requireUser();
  if (!user.isPlatformAdmin) notFound();
  return user;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
