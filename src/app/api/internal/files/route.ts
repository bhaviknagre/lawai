import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getFile } from "@/lib/storage";

/**
 * GET /api/internal/files?key=… — lets the Python AI service read uploaded files from whichever storage
 * this app uses (Vercel Blob has no S3 API). Service-to-service only: requires INTERNAL_API_TOKEN.
 */
export async function GET(req: Request) {
  const expected = process.env.INTERNAL_API_TOKEN;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  if (!expected || !timingSafeEqual(digest(req.headers.get("authorization") ?? ""), digest(`Bearer ${expected}`)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = new URL(req.url).searchParams.get("key");
  if (!key || key.includes("..")) return NextResponse.json({ error: "Missing or invalid key" }, { status: 400 });
  try {
    return new Response(new Uint8Array(await getFile(key)), { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
