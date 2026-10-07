import { NextResponse } from "next/server";
import { z } from "zod";
import { firmStatusJson, setFirmSuspended, suspendSchema } from "@/lib/onboarding";
import { platformAuthError, platformError } from "@/lib/platform-api";

/** POST /api/platform/firms/{id}/suspend — stop service (e.g. unpaid invoice). Body: { "reason"?: string }. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = platformAuthError(req);
  if (denied) return denied;
  try {
    const firmId = z.string().uuid("Firm id must be a UUID.").parse((await ctx.params).id);
    const text = await req.text();
    const { reason } = suspendSchema.parse(text ? JSON.parse(text) : {});
    return NextResponse.json({ firm: firmStatusJson(await setFirmSuspended(firmId, true, reason)) });
  } catch (e) {
    return platformError(e);
  }
}
