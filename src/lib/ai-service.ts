import "server-only";
import { cache } from "react";
import type { MessageSource } from "@/db/schema";

/**
 * Client for the Python AI service (./ai): parsing, chunking, embeddings, retrieval, the agent, review,
 * drafting and research all live there. Next.js keeps auth, CRUD and conversation storage, and passes
 * only the signed-in user's id; the service re-derives permissions from the database.
 *
 * On Vercel, AI_SERVICE_URL is injected by the service binding in vercel.json. Locally it defaults to :8000.
 */
const baseUrl = () => process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";

export class AiServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}) {
  let res: Response;
  try {
    res = await fetch(new URL(path, baseUrl()), {
      method: init.method ?? "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN ?? ""}` },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
      cache: "no-store",
    });
  } catch {
    throw new AiServiceError("The AI service isn't reachable. Start it with `npm run ai:dev`.", 503);
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new AiServiceError(err?.error || `AI service error ${res.status}`, res.status);
  }
  return res;
}

const post = async <T>(path: string, body: unknown): Promise<T> => (await request(path, { body })).json() as Promise<T>;

export type AiStatus = {
  reachable: boolean;
  ai: boolean;
  provider: "anthropic" | "groq";
  models: { chat: string; fast: string };
  embeddings: "voyage" | "openai" | "none";
  contextual: boolean;
};

/** Service health for the UI. Never throws: an unreachable service reports AI as off. Cached per request. */
export const aiStatus = cache(async (): Promise<AiStatus> => {
  try {
    return { reachable: true, ...(await (await request("/v1/status", { method: "GET" })).json()) };
  } catch {
    return { reachable: false, ai: false, provider: "anthropic", models: { chat: "", fast: "" }, embeddings: "none", contextual: false };
  }
});

export type ChunkHit = {
  id: string;
  documentId: string;
  documentTitle: string;
  caseId: string | null;
  caseTitle: string | null;
  heading: string | null;
  pageNumber: number | null;
  content: string;
  context: string | null;
  score: number;
};

export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; label: string }
  | { type: "result"; text: string; sources: MessageSource[]; toolCalls: { name: string; input: unknown }[] }
  | { type: "error"; message: string };

export const aiService = {
  /** Agent run as an async stream of events (NDJSON from the service). */
  async *chat(
    body: { userId: string; mode: "chat" | "draft" | "research"; caseId: string | null; documentId: string | null; history: { role: "user" | "assistant"; content: string }[] },
    signal?: AbortSignal,
  ): AsyncGenerator<ChatEvent> {
    const res = await request("/v1/chat", { body, signal });
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) yield JSON.parse(line) as ChatEvent;
      }
    }
  },

  search: (body: { userId: string; query: string; topK?: number; caseId?: string | null; documentId?: string | null }) =>
    post<{ hits: ChunkHit[] }>("/v1/search", body).then((r) => r.hits),

  research: (body: { userId: string; query: string; jurisdictions: string[] }) => post<{ answer: string | null; results: unknown[] }>("/v1/research", body),

  review: (body: { userId: string; documentId: string; ourSide?: string }) => post<{ issues: number }>("/v1/review", body).then((r) => r.issues),

  draft: (body: { userId: string; instruction: string; tone?: string; documentId?: string | null; kind: "clause" | "document" }) =>
    post<{ text: string }>("/v1/draft", body).then((r) => r.text),

  ingest: (documentId: string, opts: { reparse?: boolean } = {}) =>
    post<{ chunks: number; embedded: boolean }>("/v1/ingest", { documentId, reparse: opts.reparse ?? false }),

  ingestPending: (limit = 10) => post<{ processed: unknown[] }>("/v1/ingest/pending", { limit }),
};
