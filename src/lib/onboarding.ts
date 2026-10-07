import "server-only";
import { and, asc, desc, eq, inArray, like, sql } from "drizzle-orm";
import { addMonths } from "date-fns";
import { z } from "zod";
import { db } from "@/db";
import { firms, sessions, users } from "@/db/schema";
import { createAccount, deliverLink, emailTaken, personSchema, slugify } from "./accounts";
import { defaultSubscription, subscriptionSchema, type SubscriptionInput } from "./subscriptions";

/**
 * Firm onboarding, shared by the /platform console and the /api/platform endpoints
 * so both follow exactly the same rules.
 */

export const onboardSchema = z.object({
  firm: z.object({
    name: z.string().trim().min(2, "Enter the firm's name."),
    jurisdictions: z.array(z.string().trim()).default([]),
  }),
  admin: personSchema.omit({ role: true }),
  /** Optional: defaults to a trial (see TRIAL_DAYS). */
  subscription: subscriptionSchema.optional(),
});
export const adminSchema = personSchema.omit({ role: true });

export class OnboardingError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
  }
}

/** "patel-associates", or "patel-associates-2" when that's taken. */
async function uniqueSlug(name: string) {
  const base = slugify(name);
  const taken = new Set((await db.select({ slug: firms.slug }).from(firms).where(like(firms.slug, `${base}%`))).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** Creates a firm and its first admin together, or neither. The admin gets an invite link. */
export async function onboardFirm(input: z.infer<typeof onboardSchema>, createdBy: string | null) {
  if (await emailTaken(input.admin.email)) throw new OnboardingError("Someone already has a LawAI account with that email.", 409);
  const slug = await uniqueSlug(input.firm.name);
  const created = await db.transaction(async (tx) => {
    const sub = input.subscription ?? defaultSubscription();
    const [firm] = await tx
      .insert(firms)
      .values({ name: input.firm.name, slug, jurisdictions: input.firm.jurisdictions, plan: sub.plan, seatLimit: sub.seatLimit, monthlyFee: sub.monthlyFee, subscriptionEndsAt: sub.endsAt })
      .returning();
    const { user, link } = await createAccount({ ...input.admin, role: "admin", firmId: firm!.id }, createdBy, tx);
    return { firm: firm!, admin: user, link };
  });
  return { ...created, delivery: await deliverLink(created.admin, created.link, "invite") };
}

/** Another admin for an existing firm: a second partner, or a replacement when the first admin leaves. */
export async function addFirmAdmin(firmId: string, input: z.infer<typeof adminSchema>, createdBy: string | null) {
  const [firm] = await db.select().from(firms).where(eq(firms.id, firmId)).limit(1);
  if (!firm) throw new OnboardingError("No firm with that id.", 404);
  if (await emailTaken(input.email)) throw new OnboardingError("Someone already has a LawAI account with that email.", 409);
  const { user, link } = await createAccount({ ...input, role: "admin", firmId }, createdBy);
  return { firm, admin: user, link, delivery: await deliverLink(user, link, "invite") };
}

export async function listFirms() {
  const [rows, admins] = await Promise.all([
    db
      .select({
        id: firms.id,
        name: firms.name,
        slug: firms.slug,
        jurisdictions: firms.jurisdictions,
        createdAt: firms.createdAt,
        suspendedAt: firms.suspendedAt,
        suspendedReason: firms.suspendedReason,
        plan: firms.plan,
        seatLimit: firms.seatLimit,
        monthlyFee: firms.monthlyFee,
        subscriptionEndsAt: firms.subscriptionEndsAt,
        activeUsers: sql<number>`count(${users.id}) filter (where ${users.deactivatedAt} is null and ${users.activatedAt} is not null)`.mapWith(Number),
        pendingInvites: sql<number>`count(${users.id}) filter (where ${users.deactivatedAt} is null and ${users.activatedAt} is null)`.mapWith(Number),
      })
      .from(firms)
      .leftJoin(users, eq(users.firmId, firms.id))
      .groupBy(firms.id)
      .orderBy(desc(firms.createdAt)),
    db
      .select({ id: users.id, firmId: users.firmId, name: users.name, email: users.email, activatedAt: users.activatedAt, deactivatedAt: users.deactivatedAt })
      .from(users)
      .where(eq(users.role, "admin"))
      .orderBy(asc(users.name)),
  ]);
  return rows.map((f) => ({ ...f, admins: admins.filter((a) => a.firmId === f.id).map(({ firmId: _, ...a }) => a) }));
}

export const suspendSchema = z.object({ reason: z.string().trim().max(200).optional().transform((v) => v || null) });

/**
 * Stops or restores service for a whole firm (e.g. unpaid invoice). Suspending signs everyone out at once
 * and blocks sign-in and invite links; restoring lets them straight back in. No data is touched.
 */
export async function setFirmSuspended(firmId: string, suspended: boolean, reason: string | null = null) {
  const [firm] = await db.select().from(firms).where(eq(firms.id, firmId)).limit(1);
  if (!firm) throw new OnboardingError("No firm with that id.", 404);
  if (suspended) {
    const [operator] = await db.select({ id: users.id }).from(users).where(and(eq(users.firmId, firmId), eq(users.isPlatformAdmin, true))).limit(1);
    if (operator) throw new OnboardingError("This firm has a LawAI operator in it; suspending it would lock you out.", 409);
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(firms)
      .set(suspended ? { suspendedAt: firm.suspendedAt ?? new Date(), suspendedReason: reason } : { suspendedAt: null, suspendedReason: null })
      .where(eq(firms.id, firmId))
      .returning();
    if (suspended) await tx.delete(sessions).where(inArray(sessions.userId, tx.select({ id: users.id }).from(users).where(eq(users.firmId, firmId))));
    return row!;
  });
}

/** Change a firm's plan, seats, fee or end date (a renewal is just a later end date). */
export async function setSubscription(firmId: string, sub: SubscriptionInput) {
  const [row] = await db
    .update(firms)
    .set({ plan: sub.plan, seatLimit: sub.seatLimit, monthlyFee: sub.monthlyFee, subscriptionEndsAt: sub.endsAt })
    .where(eq(firms.id, firmId))
    .returning();
  if (!row) throw new OnboardingError("No firm with that id.", 404);
  return row;
}

/** Push the end date out by whole months, from the current end date or from today if it has already passed. */
export async function extendSubscription(firmId: string, months: number) {
  const [firm] = await db.select().from(firms).where(eq(firms.id, firmId)).limit(1);
  if (!firm) throw new OnboardingError("No firm with that id.", 404);
  const now = new Date();
  const from = firm.subscriptionEndsAt && firm.subscriptionEndsAt > now ? firm.subscriptionEndsAt : now;
  await db.update(firms).set({ subscriptionEndsAt: addMonths(from, months) }).where(eq(firms.id, firmId));
}

/** True when the firm has no free seat for another person (active + invited count against the limit). */
export async function seatsFull(firmId: string) {
  const [row] = await db
    .select({ limit: firms.seatLimit, used: sql<number>`(select count(*) from ${users} where ${users.firmId} = ${firms.id} and ${users.deactivatedAt} is null)`.mapWith(Number) })
    .from(firms)
    .where(eq(firms.id, firmId));
  return !!row && row.limit !== null && row.used >= row.limit;
}

export const firmStatusJson = (f: { id: string; name: string; slug: string; suspendedAt: Date | null; suspendedReason: string | null }) => ({
  id: f.id,
  name: f.name,
  slug: f.slug,
  status: f.suspendedAt ? "suspended" : "active",
  suspendedAt: f.suspendedAt?.toISOString() ?? null,
  suspendedReason: f.suspendedReason,
});
