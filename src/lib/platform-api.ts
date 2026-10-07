import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { OnboardingError } from "./onboarding";

/**
 * Bearer-token auth for /api/platform/*. The token lives only in PLATFORM_API_TOKEN (Vercel env),
 * never in the repo. Unset = the API is switched off.
 */
export function platformAuthError(req: Request) {
  const expected = process.env.PLATFORM_API_TOKEN;
  if (!expected || expected.length < 32) return NextResponse.json({ error: "Platform API is disabled. Set PLATFORM_API_TOKEN (32+ characters)." }, { status: 503 });
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const digest = (s: string) => createHash("sha256").update(s).digest();
  if (!timingSafeEqual(digest(given), digest(expected))) return NextResponse.json({ error: "Invalid or missing API token." }, { status: 401 });
  return null;
}

/** Validation → 400, known conflicts → 404/409, anything else → 500 without internals. */
export function platformError(e: unknown) {
  if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]!.message, field: e.issues[0]!.path.join(".") }, { status: 400 });
  if (e instanceof OnboardingError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof SyntaxError) return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  console.error("[platform-api]", e);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

export const inviteJson = (link: { url: string; expiresAt: Date }, delivery: { emailed: boolean; emailNote?: string }) => ({
  url: link.url,
  expiresAt: link.expiresAt.toISOString(),
  emailed: delivery.emailed,
  ...(delivery.emailNote ? { emailNote: delivery.emailNote } : {}),
});
