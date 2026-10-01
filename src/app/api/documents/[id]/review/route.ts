import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, notifications } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { accessibleCaseIds, caseScope } from "@/lib/access";
import { aiService, aiStatus } from "@/lib/ai-service";
import { logActivity } from "@/lib/queries/common";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await aiStatus()).ai) return NextResponse.json({ error: "AI isn't configured. Start the AI service and set an LLM API key to run AI review." }, { status: 400 });
  const { id } = await params;
  const { ourSide } = (await req.json().catch(() => ({}))) as { ourSide?: string };
  const ids = await accessibleCaseIds(user);
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.firmId, user.firmId), caseScope(documents.caseId, ids)));
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const n = await aiService.review({ userId: user.id, documentId: id, ourSide });
    await logActivity(user, { action: "review", description: `AI review of ${doc.title}: ${n} finding${n === 1 ? "" : "s"}`, caseId: doc.caseId });
    await db.insert(notifications).values({ userId: user.id, title: `Review finished: ${doc.title}`, body: `${n} finding${n === 1 ? "" : "s"}`, href: `/documents/${id}` });
    return NextResponse.json({ issues: n });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
