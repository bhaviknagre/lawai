import { NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations, messages, type MessageSource } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { accessibleCaseIds } from "@/lib/access";
import { aiService, aiStatus } from "@/lib/ai-service";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Events streamed to the browser (the agent's text/tool events are relayed from the AI service). */
type StreamEvent =
  | { type: "conversation"; id: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; label: string }
  | { type: "sources"; sources: MessageSource[] }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };

const body = z.object({
  conversationId: z.string().uuid().nullish(),
  message: z.string().trim().min(1).max(8000),
  mode: z.enum(["chat", "draft", "research"]).default("chat"),
  caseId: z.string().uuid().nullish(),
  documentId: z.string().uuid().nullish(),
});

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const input = parsed.data;
  const caseIds = await accessibleCaseIds(user);

  // Resolve or create the conversation (and validate scope against permissions).
  let conv = input.conversationId
    ? (await db.select().from(conversations).where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, user.id))))[0]
    : undefined;
  if (input.conversationId && !conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  const caseId = input.caseId ?? conv?.caseId ?? null;
  if (caseId && !caseIds.includes(caseId)) return NextResponse.json({ error: "No access to that matter" }, { status: 403 });
  const documentId = input.documentId ?? conv?.documentId ?? null;
  if (!conv) {
    [conv] = await db
      .insert(conversations)
      .values({ firmId: user.firmId, userId: user.id, title: input.message.slice(0, 80), caseId, documentId })
      .returning();
  } else if (input.caseId !== undefined || input.documentId !== undefined) {
    await db.update(conversations).set({ caseId, documentId }).where(eq(conversations.id, conv.id));
  }

  // Last 20 turns as context (text only; tool traces aren't replayed).
  const prior = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conv!.id))
    .orderBy(desc(messages.createdAt))
    .limit(20);
  const history = prior.reverse().map((m) => ({ role: m.role, content: m.content }));
  history.push({ role: "user", content: input.message });
  await db.insert(messages).values({ conversationId: conv!.id, role: "user", content: input.message });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      send({ type: "conversation", id: conv!.id });
      try {
        if (!(await aiStatus()).ai) {
          const msg = "AI isn't configured yet. Start the AI service (`npm run ai:dev`) and set `LLM_PROVIDER` with its API key in `.env`. Everything else in the workspace works without it.";
          send({ type: "text", delta: msg });
          const [saved] = await db.insert(messages).values({ conversationId: conv!.id, role: "assistant", content: msg }).returning();
          send({ type: "done", messageId: saved!.id });
          return;
        }
        let result: { text: string; sources: MessageSource[]; toolCalls: { name: string; input: unknown }[] } | null = null;
        const events = aiService.chat(
          { userId: user.id, mode: input.mode, caseId, documentId, history },
          req.signal,
        );
        for await (const e of events) {
          if (e.type === "result") result = e;
          else if (e.type === "error") throw new Error(e.message);
          else send(e);
        }
        if (!result) throw new Error("The AI service ended the response early.");
        const [saved] = await db
          .insert(messages)
          .values({ conversationId: conv!.id, role: "assistant", content: result.text || "I couldn't produce an answer.", sources: result.sources, toolCalls: result.toolCalls })
          .returning();
        await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conv!.id));
        send({ type: "sources", sources: result.sources });
        send({ type: "done", messageId: saved!.id });
      } catch (e) {
        console.error("[chat]", e);
        send({ type: "error", message: (e as Error).message || "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("c");
  if (!id) return NextResponse.json({ messages: [] });
  const [conv] = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, user.id)));
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rows = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));
  return NextResponse.json({ conversation: conv, messages: rows });
}
