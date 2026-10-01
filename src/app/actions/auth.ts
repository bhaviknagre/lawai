"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";

const schema = z.object({ email: z.string().email(), password: z.string().min(1), next: z.string().optional() });

export async function login(_: unknown, form: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password." };
  const user = await verifyPassword(parsed.data.email, parsed.data.password);
  if (!user) return { error: "That email and password don't match an account." };
  await createSession(user.id);
  const next = parsed.data.next?.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/";
  redirect(next);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
