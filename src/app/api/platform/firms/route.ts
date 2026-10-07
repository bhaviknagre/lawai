import { NextResponse } from "next/server";
import { listFirms, onboardFirm, onboardSchema } from "@/lib/onboarding";
import { inviteJson, platformAuthError, platformError } from "@/lib/platform-api";

/** GET /api/platform/firms — every firm with its admins and user counts. */
export async function GET(req: Request) {
  const denied = platformAuthError(req);
  if (denied) return denied;
  return NextResponse.json({ firms: await listFirms() });
}

/** POST /api/platform/firms — onboard a firm and its first admin; returns the admin's invite link. */
export async function POST(req: Request) {
  const denied = platformAuthError(req);
  if (denied) return denied;
  try {
    const input = onboardSchema.parse(await req.json());
    const { firm, admin, link, delivery } = await onboardFirm(input, null);
    return NextResponse.json(
      {
        firm: { id: firm.id, name: firm.name, slug: firm.slug, jurisdictions: firm.jurisdictions },
        admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role, title: admin.title },
        invite: inviteJson(link, delivery),
      },
      { status: 201 },
    );
  } catch (e) {
    return platformError(e);
  }
}
