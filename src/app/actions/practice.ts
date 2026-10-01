"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { caseMembers, cases, clients, events, tasks, timeEntries } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { accessibleCaseIds, assertCaseAccess } from "@/lib/access";
import { logActivity } from "@/lib/queries/common";

const opt = z.string().trim().optional().transform((v) => (v ? v : null));
const uuidOpt = z.string().uuid().optional().or(z.literal("")).transform((v) => (v ? v : null));

export type FormState = { error?: string; ok?: boolean } | null;

// ── Cases ───────────────────────────────────────────────────────────
const caseSchema = z.object({
  title: z.string().trim().min(3, "Give the case a title."),
  clientId: z.string().uuid("Choose a client."),
  practiceArea: z.string().trim().min(2, "Choose a practice area."),
  jurisdiction: z.string().min(2),
  court: opt,
  stage: z.string().trim().default("Intake"),
  priority: z.enum(["high", "medium", "low"]),
  opposingParty: opt,
  opposingCounsel: opt,
  description: opt,
  caseNumber: opt,
});

export async function createCase(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = caseSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]!.message };
  const team = form.getAll("team").map(String).filter(Boolean);
  const year = new Date().getFullYear();
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(cases).where(eq(cases.firmId, user.firmId));
  const caseNumber = p.data.caseNumber ?? `M-${year}-${String(n + 1).padStart(4, "0")}`;
  const [row] = await db
    .insert(cases)
    .values({ ...p.data, caseNumber, firmId: user.firmId })
    .returning()
    .catch((e) => {
      if (String(e.message).includes("cases_number_idx")) throw new Error("That case number is already used.");
      throw e;
    });
  const members = Array.from(new Set([user.id, ...team]));
  await db.insert(caseMembers).values(members.map((u) => ({ caseId: row!.id, userId: u, role: u === user.id ? "lead" : "member" })));
  await logActivity(user, { action: "case_created", description: `Opened matter ${row!.title}`, caseId: row!.id, clientId: row!.clientId });
  revalidatePath("/", "layout");
  redirect(`/cases/${row!.id}`);
}

export async function updateCase(id: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  await assertCaseAccess(user, id);
  const data = z
    .object({ stage: z.string().trim().min(1), priority: z.enum(["high", "medium", "low"]), status: z.enum(["active", "on_hold", "closed"]), court: opt, description: opt })
    .safeParse(Object.fromEntries(form));
  if (!data.success) return { error: data.error.issues[0]!.message };
  const [before] = await db.select().from(cases).where(eq(cases.id, id));
  await db
    .update(cases)
    .set({ ...data.data, closedAt: data.data.status === "closed" ? (before!.closedAt ?? new Date().toISOString().slice(0, 10)) : null })
    .where(eq(cases.id, id));
  const changes = (["stage", "priority", "status"] as const).filter((k) => before![k] !== data.data[k]).map((k) => `${k} → ${data.data[k]}`);
  if (changes.length) await logActivity(user, { action: "case_updated", description: `Updated ${changes.join(", ")}`, caseId: id, clientId: before!.clientId });
  revalidatePath(`/cases/${id}`);
  return { ok: true };
}

export async function setCaseTeam(id: string, form: FormData) {
  const user = await requireUser();
  await assertCaseAccess(user, id);
  const team = Array.from(new Set(form.getAll("team").map(String).filter(Boolean)));
  if (!team.length) return;
  const lead = String(form.get("lead") || team[0]);
  await db.transaction(async (tx) => {
    await tx.delete(caseMembers).where(eq(caseMembers.caseId, id));
    await tx.insert(caseMembers).values(team.map((u) => ({ caseId: id, userId: u, role: u === lead ? "lead" : "member" })));
  });
  await logActivity(user, { action: "team_updated", description: `Updated the matter team (${team.length} people)`, caseId: id });
  revalidatePath(`/cases/${id}`);
}

// ── Clients ─────────────────────────────────────────────────────────
const clientSchema = z.object({
  name: z.string().trim().min(2, "Enter the client's name."),
  type: z.enum(["company", "individual", "trust", "estate"]),
  location: opt,
  email: z.string().trim().email("Enter a valid email.").optional().or(z.literal("")).transform((v) => v || null),
  phone: opt,
  primaryContact: opt,
  contactTitle: opt,
  billing: opt,
  notes: opt,
});

export async function createClient(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = clientSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]!.message };
  const today = new Date().toISOString().slice(0, 10);
  const conflictChecked = form.get("conflictChecked") === "on";
  const [row] = await db
    .insert(clients)
    .values({ ...p.data, firmId: user.firmId, clientSince: today, conflictCheckedAt: conflictChecked ? today : null })
    .returning();
  await logActivity(user, { action: "client_created", description: `Added client ${row!.name}`, clientId: row!.id });
  revalidatePath("/clients");
  redirect(`/clients/${row!.id}`);
}

export async function updateClient(id: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = clientSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]!.message };
  await db.update(clients).set(p.data).where(and(eq(clients.id, id), eq(clients.firmId, user.firmId)));
  await logActivity(user, { action: "client_updated", description: "Updated client details", clientId: id });
  revalidatePath(`/clients/${id}`);
  return { ok: true };
}

export async function logClientActivity(clientId: string, form: FormData) {
  const user = await requireUser();
  const desc = String(form.get("description") ?? "").trim();
  const action = String(form.get("action") ?? "note");
  const caseId = String(form.get("caseId") ?? "") || null;
  if (!desc) return;
  if (caseId) await assertCaseAccess(user, caseId);
  await logActivity(user, { action, description: desc, clientId, caseId });
  revalidatePath(`/clients/${clientId}`);
}

// ── Calendar & tasks ────────────────────────────────────────────────
export async function createEvent(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = z
    .object({
      title: z.string().trim().min(2, "Give the event a title."),
      type: z.enum(["hearing", "deadline", "meeting", "internal"]),
      date: z.string().min(8, "Choose a date."),
      time: z.string().optional(),
      caseId: uuidOpt,
      location: opt,
      judge: opt,
      notes: opt,
    })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]!.message };
  if (p.data.caseId) await assertCaseAccess(user, p.data.caseId);
  const allDay = !p.data.time;
  const startsAt = new Date(`${p.data.date}T${p.data.time || "09:00"}`);
  await db.insert(events).values({ firmId: user.firmId, caseId: p.data.caseId, title: p.data.title, type: p.data.type, startsAt, allDay, location: p.data.location, judge: p.data.judge, notes: p.data.notes, createdBy: user.id });
  if (p.data.caseId) await logActivity(user, { action: "event_created", description: `Scheduled ${p.data.type}: ${p.data.title}`, caseId: p.data.caseId });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteEvent(id: string) {
  const user = await requireUser();
  const ids = await accessibleCaseIds(user);
  const [ev] = await db.select().from(events).where(and(eq(events.id, id), eq(events.firmId, user.firmId)));
  if (!ev || (ev.caseId && !ids.includes(ev.caseId))) return;
  await db.delete(events).where(eq(events.id, id));
  revalidatePath("/", "layout");
}

export async function createTask(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = z
    .object({
      title: z.string().trim().min(2, "Describe the task."),
      caseId: uuidOpt,
      assigneeId: uuidOpt,
      due: z.string().optional(),
      priority: z.enum(["high", "medium", "low"]).default("medium"),
      description: opt,
    })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]!.message };
  if (p.data.caseId) await assertCaseAccess(user, p.data.caseId);
  await db.insert(tasks).values({
    firmId: user.firmId,
    caseId: p.data.caseId,
    title: p.data.title,
    description: p.data.description,
    assigneeId: p.data.assigneeId ?? user.id,
    dueAt: p.data.due ? new Date(`${p.data.due}T17:00`) : null,
    priority: p.data.priority,
    createdBy: user.id,
  });
  if (p.data.caseId) await logActivity(user, { action: "task_created", description: `Added task: ${p.data.title}`, caseId: p.data.caseId });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function toggleTask(id: string, done: boolean) {
  const user = await requireUser();
  const ids = await accessibleCaseIds(user);
  const [t] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.firmId, user.firmId)));
  if (!t || (t.caseId && !ids.includes(t.caseId))) return;
  await db.update(tasks).set({ status: done ? "done" : "open", completedAt: done ? new Date() : null }).where(eq(tasks.id, id));
  if (done && t.caseId) await logActivity(user, { action: "task_done", description: `Completed: ${t.title}`, caseId: t.caseId });
  revalidatePath("/", "layout");
}

export async function logTime(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = z
    .object({ caseId: uuidOpt, hours: z.coerce.number().min(0.1).max(24), date: z.string().min(8), description: opt, billable: z.string().optional() })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Enter hours between 0.1 and 24." };
  if (p.data.caseId) await assertCaseAccess(user, p.data.caseId);
  await db.insert(timeEntries).values({
    firmId: user.firmId,
    userId: user.id,
    caseId: p.data.caseId,
    workDate: p.data.date,
    hours: p.data.hours.toFixed(2),
    billable: p.data.billable === "on",
    description: p.data.description,
  });
  revalidatePath("/reports");
  if (p.data.caseId) revalidatePath(`/cases/${p.data.caseId}`);
  return { ok: true };
}
