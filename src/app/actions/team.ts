"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { requireUser, type SessionUser } from "@/lib/auth";
import { assertCan } from "@/lib/permissions";
import { ROLES, createAccount, deliverLink, emailTaken, issueLink, issueReset, personSchema, type LinkState } from "@/lib/accounts";
import { logActivity } from "@/lib/queries/common";
import { seatsFull } from "@/lib/onboarding";

const SEATS_FULL = "Your firm has used all its LawAI seats. Deactivate someone, or contact LawAI to add seats.";

async function requireTeamAdmin() {
  const user = await requireUser();
  assertCan(user, "team.manage");
  return user;
}

/** A member of the admin's own firm, never the admin themselves (so a firm always keeps an active admin). */
async function teammate(admin: SessionUser, userId: string) {
  const [row] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.firmId, admin.firmId))).limit(1);
  if (!row) throw new Error("That person isn't in your firm.");
  if (row.id === admin.id) throw new Error("You can't change your own access. Ask another admin.");
  return row;
}

/** Emails the link, then hands it back so the screen can confirm delivery or show it to pass on. */
async function linkState(u: { id: string; name: string; email: string; firmId: string }, link: { url: string; expiresAt: Date }, kind: "invite" | "reset", invitedBy?: string): Promise<LinkState> {
  const sent = await deliverLink(u, link, kind, invitedBy);
  return { ok: true, link: { name: u.name, email: u.email, url: link.url, expiresAt: link.expiresAt.toISOString(), kind, ...sent } };
}

export async function inviteTeamMember(_: LinkState, form: FormData): Promise<LinkState> {
  const admin = await requireTeamAdmin();
  const p = personSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]!.message };
  if (await emailTaken(p.data.email)) return { error: "Someone already has a LawAI account with that email." };
  if (await seatsFull(admin.firmId)) return { error: SEATS_FULL };
  const { user, link } = await createAccount({ ...p.data, firmId: admin.firmId }, admin.id);
  await logActivity(admin, { action: "user_invited", description: `Invited ${user.name} as ${user.role}` });
  revalidatePath("/settings");
  return linkState(user, link, "invite", admin.name);
}

/** New invite link for someone who hasn't accepted yet; the old link stops working. */
export async function resendInvite(userId: string, _: LinkState): Promise<LinkState> {
  const admin = await requireTeamAdmin();
  const row = await teammate(admin, userId);
  if (row.activatedAt) return { error: `${row.name} has already joined. Use Reset password instead.` };
  const link = await issueLink(row.id, "invite", admin.id);
  return linkState(row, link, "invite", admin.name);
}

/** Old password stops working, every session ends, and the person picks a new password via the link. */
export async function resetMemberPassword(userId: string, _: LinkState): Promise<LinkState> {
  const admin = await requireTeamAdmin();
  const row = await teammate(admin, userId);
  const link = await issueReset(row.id, admin.id);
  await db.delete(sessions).where(eq(sessions.userId, row.id));
  await logActivity(admin, { action: "password_reset", description: `Reset the password for ${row.name}` });
  return linkState(row, link, "reset");
}

export async function setMemberRole(userId: string, form: FormData) {
  const admin = await requireTeamAdmin();
  const row = await teammate(admin, userId);
  const role = z.enum(ROLES).parse(form.get("role"));
  if (role === row.role) return;
  await db.update(users).set({ role }).where(eq(users.id, row.id));
  await logActivity(admin, { action: "role_changed", description: `Changed ${row.name}'s role from ${row.role} to ${role}` });
  revalidatePath("/settings");
}

export async function setMemberActive(userId: string, active: boolean) {
  const admin = await requireTeamAdmin();
  const row = await teammate(admin, userId);
  if (active && row.deactivatedAt && (await seatsFull(admin.firmId))) throw new Error(SEATS_FULL);
  await db.update(users).set({ deactivatedAt: active ? null : new Date() }).where(eq(users.id, row.id));
  if (!active) await db.delete(sessions).where(eq(sessions.userId, row.id));
  await logActivity(admin, { action: active ? "user_reactivated" : "user_deactivated", description: `${active ? "Reactivated" : "Deactivated"} ${row.name}` });
  revalidatePath("/", "layout");
}
