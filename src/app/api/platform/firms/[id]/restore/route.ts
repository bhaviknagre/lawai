import { NextResponse } from "next/server";
import { z } from "zod";
import { firmStatusJson, setFirmSuspended } from "@/lib/onboarding";
import { platformAuthError, platformError } from "@/lib/platform-api";

/** POST /api/platform/firms/{id}/restore — resume service after payment. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = platformAuthError(req);
  if (denied) return denied;
  try {
    const firmId = z.string().uuid("Firm id must be a UUID.").parse((await ctx.params).id);
    return NextResponse.json({ firm: firmStatusJson(await setFirmSuspended(firmId, false)) });
  } catch (e) {
    return platformError(e);
  }
}
