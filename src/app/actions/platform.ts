"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requirePlatformAdmin } from "@/lib/auth";
import { addFirmAdmin, adminSchema, onboardFirm, onboardSchema, OnboardingError, setFirmSuspended, suspendSchema } from "@/lib/onboarding";
import type { LinkState } from "@/lib/accounts";

function failure(e: unknown): LinkState {
  if (e instanceof ZodError) return { error: e.issues[0]!.message };
  if (e instanceof OnboardingError) return { error: e.message };
  throw e;
}

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
    });
    const { admin, link, delivery } = await onboardFirm(input, operator.id);
    revalidatePath("/platform");
    return inviteState(admin, link, delivery);
  } catch (e) {
    return failure(e);
  }
}

export async function createFirmAdmin(firmId: string, _: LinkState, form: FormData): Promise<LinkState> {
  const operator = await requirePlatformAdmin();
  try {
    const { admin, link, delivery } = await addFirmAdmin(firmId, adminSchema.parse(Object.fromEntries(form)), operator.id);
    revalidatePath("/platform");
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
  revalidatePath("/platform");
  return { ok: true };
}

export async function restoreFirm(firmId: string) {
  await requirePlatformAdmin();
  await setFirmSuspended(firmId, false);
  revalidatePath("/platform");
}
