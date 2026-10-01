import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { aiService, aiStatus } from "@/lib/ai-service";

export const runtime = "nodejs";
export const maxDuration = 120;

const body = z.object({
  instruction: z.string().trim().min(5).max(4000),
  tone: z.string().max(100).optional(),
  documentId: z.string().uuid().nullish(),
  kind: z.enum(["clause", "document"]).default("clause"),
});

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await aiStatus()).ai) return NextResponse.json({ error: "AI isn't configured. Start the AI service and set an LLM API key to use AI drafting." }, { status: 400 });
  const p = body.safeParse(await req.json());
  if (!p.success) return NextResponse.json({ error: "Describe what to draft (at least a few words)." }, { status: 400 });
  try {
    const text = await aiService.draft({ userId: user.id, ...p.data });
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
