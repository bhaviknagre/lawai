import { NextResponse, after } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { accessibleCaseIds } from "@/lib/access";
import { putFile } from "@/lib/storage";
import { aiService } from "@/lib/ai-service";
import { logActivity } from "@/lib/queries/common";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = /\.(pdf|docx|txt|md)$/i;

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const form = await req.formData();
  const caseId = String(form.get("caseId") || "") || null;
  const kind = String(form.get("kind") || "Other");
  if (caseId && !(await accessibleCaseIds(user)).includes(caseId)) return NextResponse.json({ error: "No access to that matter" }, { status: 403 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "Choose at least one file." }, { status: 400 });
  const created: string[] = [];
  for (const file of files) {
    if (!ALLOWED.test(file.name)) return NextResponse.json({ error: `${file.name}: upload PDF, DOCX, TXT or MD.` }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: `${file.name} is larger than 25 MB.` }, { status: 400 });
    const key = `${user.firmId}/${randomUUID()}-${file.name.replace(/[^\w.\- ]+/g, "_")}`;
    await putFile(key, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream");
    const [doc] = await db
      .insert(documents)
      .values({ firmId: user.firmId, caseId, title: file.name, kind, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, storageKey: key, uploadedBy: user.id, ingestStatus: "pending" })
      .returning();
    created.push(doc!.id);
    await logActivity(user, { action: "upload", description: `Uploaded ${file.name}`, caseId });
  }
  // Parse → chunk → contextualise → embed in the AI service, after the response is sent.
  // For heavy volume, move this to a queue (Vercel Queues); /api/cron/ingest retries stragglers.
  after(async () => {
    for (const id of created) await aiService.ingest(id).catch((e) => console.error("[ingest]", id, e.message));
  });
  return NextResponse.json({ ids: created });
}
