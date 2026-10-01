import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { accessibleCaseIds, caseScope } from "@/lib/access";
import { getFile } from "@/lib/storage";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const ids = await accessibleCaseIds(user);
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.firmId, user.firmId), caseScope(documents.caseId, ids)));
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const asText = new URL(req.url).searchParams.get("format") === "text" || !doc.storageKey || doc.version > 1;
  const name = encodeURIComponent(asText ? doc.title.replace(/\.\w+$/, "") + ".txt" : doc.title);
  if (asText) {
    return new Response(doc.content ?? "", { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${name}` } });
  }
  const buf = await getFile(doc.storageKey!);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": doc.mimeType, "Content-Disposition": `attachment; filename*=UTF-8''${name}` } });
}
