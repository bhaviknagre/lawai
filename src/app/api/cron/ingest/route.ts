import { NextResponse } from "next/server";
import { aiService } from "@/lib/ai-service";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Retries documents stuck in pending/processing (e.g. server restarted mid-ingest). Called by Vercel Cron. */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { processed } = await aiService.ingestPending(10);
  return NextResponse.json({ processed });
}
