"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { firms, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";

export async function updateProfile(_: unknown, form: FormData) {
  const user = await requireUser();
  const p = z.object({ name: z.string().trim().min(2), title: z.string().trim().min(2), weeklyTargetHours: z.coerce.number().min(0).max(80) }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Check your name, title and target hours." };
  await db.update(users).set(p.data).where(eq(users.id, user.id));
  const pw = String(form.get("password") ?? "");
  if (pw) {
    if (pw.length < 8) return { error: "New password must be at least 8 characters." };
    await db.update(users).set({ passwordHash: await bcrypt.hash(pw, 10) }).where(eq(users.id, user.id));
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateFirm(_: unknown, form: FormData) {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Only admins can change firm settings." };
  const jurisdictions = form.getAll("jurisdictions").map(String);
  const minutes = Object.fromEntries(["chat", "review", "draft", "research"].map((k) => [k, Math.max(0, Number(form.get(`min_${k}`)) || 0)]));
  const name = String(form.get("name") ?? "").trim();
  await db.update(firms).set({ jurisdictions, aiMinutesSaved: minutes, ...(name ? { name } : {}) }).where(eq(firms.id, user.firmId));
  revalidatePath("/", "layout");
  return { ok: true };
}
