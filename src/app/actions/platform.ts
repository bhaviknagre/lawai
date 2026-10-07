"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requirePlatformAdmin } from "@/lib/auth";
import { addFirmAdmin, adminSchema, extendSubscription, onboardFirm, onboardSchema, OnboardingError, setFirmSuspended, setSubscription, suspendSchema } from "@/lib/onboarding";
import { subscriptionSchema } from "@/lib/subscriptions";
import { deliverLink, issueLink, type LinkState } from "@/lib/accounts";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

function failure(e: unknown): LinkState {
  if (e instanceof ZodError) return { error: e.issues[0]!.message };
  if (e instanceof OnboardingError) return { error: e.message };
  throw e;
}

const subscriptionFields = (form: FormData) => ({ plan: form.get("plan"), seatLimit: form.get("seatLimit"), monthlyFee: form.get("monthlyFee"), endsAt: form.get("endsAt") });

/** Every /platform page shows firm data, so refresh them all. */
const refresh = () => revalidatePath("/platform", "layout");

const inviteState = (admin: { name: string; email: string }, link: { url: string; expiresAt: Date }, delivery: { emailed: boolean; emailNote?: string }): LinkState => ({
  ok: true,
  link: { name: admin.name, email: admin.email, url: link.url, expiresAt: link.expiresAt.toISOString(), kind: "invite", ...delivery },
});

/** Onboards a customer: the firm and its first admin, together or not at all. Same rules as POST /api/platform/firms. */
export async function createFirm(_: LinkState, form: FormData): Promise<LinkState> {
  const operator = await requirePlatformAdmin();
  try {
    const input = onboardSchema.parse({
      firm: { name: form.get("firmName"), jurisdictions: form.getAll("jurisdictions").map(String) },
      admin: { name: form.get("name"), email: form.get("email"), title: form.get("title") },
      subscription: subscriptionFields(form),
    });
    const { admin, link, delivery } = await onboardFirm(input, operator.id);
    refresh();
    return inviteState(admin, link, delivery);
  } catch (e) {
    return failure(e);
  }
}

export async function createFirmAdmin(firmId: string, _: LinkState, form: FormData): Promise<LinkState> {
  const operator = await requirePlatformAdmin();
  try {
    const { admin, link, delivery } = await addFirmAdmin(firmId, adminSchema.parse(Object.fromEntries(form)), operator.id);
    refresh();
    return inviteState(admin, link, delivery);
  } catch (e) {
    return failure(e);
  }
}

/** Stop service for a firm (e.g. unpaid invoice): everyone is signed out and can't sign in until restored. */
export async function suspendFirm(firmId: string, _: unknown, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await requirePlatformAdmin();
  try {
    await setFirmSuspended(firmId, true, suspendSchema.parse({ reason: form.get("reason") ?? undefined }).reason);
  } catch (e) {
    return { error: failure(e)!.error };
  }
  refresh();
  return { ok: true };
}

export async function restoreFirm(firmId: string) {
  await requirePlatformAdmin();
  await setFirmSuspended(firmId, false);
  refresh();
}

/** Fresh invite link for a firm admin who hasn't set their password yet (lost or expired link). The old link stops working. */
export async function resendAdminInvite(userId: string, _: LinkState): Promise<LinkState> {
  const operator = await requirePlatformAdmin();
  const [admin] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.role, "admin"), isNull(users.activatedAt))).limit(1);
  if (!admin) return { error: "This admin has already set their password. Their firm can use Reset password, or add another admin." };
  const link = await issueLink(admin.id, "invite", operator.id);
  return inviteState(admin, link, await deliverLink(admin, link, "invite"));
}

/** Plan, seats, monthly fee and end date. A renewal is a later end date. */
export async function updateSubscription(firmId: string, _: unknown, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await requirePlatformAdmin();
  try {
    await setSubscription(firmId, subscriptionSchema.parse(subscriptionFields(form)));
  } catch (e) {
    return { error: failure(e)!.error };
  }
  refresh();
  return { ok: true };
}

/** One-click renewal: push the end date out by whole months. */
export async function renewFirm(firmId: string, months: number) {
  await requirePlatformAdmin();
  await extendSubscription(firmId, months);
  refresh();
}
