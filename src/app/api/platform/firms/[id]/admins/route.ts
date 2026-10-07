import { NextResponse } from "next/server";
import { z } from "zod";
import { addFirmAdmin, adminSchema } from "@/lib/onboarding";
import { inviteJson, platformAuthError, platformError } from "@/lib/platform-api";

/** POST /api/platform/firms/{id}/admins — add another admin to an existing firm; returns their invite link. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = platformAuthError(req);
  if (denied) return denied;
  try {
    const firmId = z.string().uuid("Firm id must be a UUID.").parse((await ctx.params).id);
    const { admin, link, delivery } = await addFirmAdmin(firmId, adminSchema.parse(await req.json()), null);
    return NextResponse.json(
      { admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role, title: admin.title, firmId }, invite: inviteJson(link, delivery) },
      { status: 201 },
    );
  } catch (e) {
    return platformError(e);
  }
}
