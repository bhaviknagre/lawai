import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { aiService } from "@/lib/ai-service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const p = z.object({ query: z.string().trim().min(3).max(1000), jurisdictions: z.array(z.string()).default([]) }).safeParse(await req.json());
  if (!p.success) return NextResponse.json({ error: "Enter a research question." }, { status: 400 });
  try {
    return NextResponse.json(await aiService.research({ userId: user.id, ...p.data }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
