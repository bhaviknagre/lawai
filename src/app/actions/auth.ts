"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { after } from "next/server";
import { appUrl, MIN_PASSWORD, redeemLink, SUSPENDED_MESSAGE } from "@/lib/accounts";
import { adminActivatedEmail, sendEmail } from "@/lib/email";

const schema = z.object({ email: z.string().email(), password: z.string().min(1), next: z.string().optional() });

export async function login(_: unknown, form: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password." };
  const found = await verifyPassword(parsed.data.email, parsed.data.password);
  if (!found) return { error: "That email and password don't match an account." };
  if (found.firmSuspended) return { error: SUSPENDED_MESSAGE };
  await createSession(found.user.id);
  const next = parsed.data.next?.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/";
  redirect(next);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/** Invite or reset link: the person chooses their password, then lands in the app signed in. */
export async function acceptInvite(token: string, _: unknown, form: FormData) {
  const pw = String(form.get("password") ?? "");
  if (pw.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters.` };
  if (pw !== form.get("confirm")) return { error: "The two passwords don't match." };
  const done = await redeemLink(token, pw);
  if (!done) return { error: "This link has expired or was already used. Ask your firm's admin for a new one." };
  if (done === "suspended") return { error: SUSPENDED_MESSAGE };
  const { user, purpose, firmName } = done;
  // Tell the LawAI operator when a firm's admin has confirmed their email and is live.
  const operator = process.env.OPERATOR_EMAIL;
  if (purpose === "invite" && user.role === "admin" && operator)
    after(() => sendEmail(adminActivatedEmail({ to: operator, adminName: user.name, adminEmail: user.email, firmName, platformUrl: `${appUrl()}/platform` })));
  await createSession(user.id);
  redirect("/");
}
