"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp, BookOpenText, Briefcase, CalendarClock, CheckSquare, FileText, Gavel, Loader2, MessageSquarePlus,
  Scale, Sparkles, ThumbsDown, ThumbsUp, Trash2, User, AlertCircle,
} from "lucide-react";
import { deleteConversation, rateMessage } from "@/app/actions/assistant";
import type { MessageSource } from "@/db/schema";
import { cn } from "@/lib/utils";

type Msg = { id?: string; role: "user" | "assistant"; content: string; sources: MessageSource[]; feedback?: number | null; tools?: string[]; pending?: boolean; error?: string };
type Mode = "chat" | "draft" | "research";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "chat", label: "Ask", hint: "Questions about your matters, calendar and documents" },
  { id: "draft", label: "Draft", hint: "Clauses, letters and emails grounded in your files" },
  { id: "research", label: "Research", hint: "Case law and statutes, cited by jurisdiction" },
];

const EXAMPLES = [
  { icon: Gavel, text: "When is my next hearing?" },
  { icon: CalendarClock, text: "What's due this week across my matters?" },
  { icon: FileText, text: "What does the Johnson Corp agreement say about liability?" },
  { icon: Briefcase, text: "Summarise where Smith v. Johnson Corp stands" },
  { icon: Scale, text: "Compare remoteness of damages in England, India and Singapore" },
  { icon: CheckSquare, text: "What answer deadline applies if a NY summons was personally served today?" },
];

const SOURCE_ICON = { document: FileText, case: Briefcase, event: Gavel, task: CheckSquare, client: User, legal: BookOpenText, rule: Scale } as const;

export function Chat(props: {
  history: { id: string; title: string; updatedAt: string; caseTitle: string | null }[];
  cases: { id: string; title: string }[];
  docs: { id: string; title: string }[];
  initial: { id: string; caseId: string | null; documentId: string | null; messages: Msg[] } | null;
  initialQuestion?: string;
  initialCaseId?: string;
  initialDocId?: string;
  initialMode: Mode;
  status: { ai: boolean; embeddings: boolean };
}) {
  const router = useRouter();
  const [convId, setConvId] = useState<string | null>(props.initial?.id ?? null);
  const [msgs, setMsgs] = useState<Msg[]>(props.initial?.messages ?? []);
  const [caseId, setCaseId] = useState(props.initial?.caseId ?? props.initialCaseId ?? "");
  const [docId, setDocId] = useState(props.initial?.documentId ?? props.initialDocId ?? "");
  const [mode, setMode] = useState<Mode>(props.initialMode);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);
  useEffect(() => {
    if (props.initialQuestion && !sentInitial.current && !props.initial) {
      sentInitial.current = true;
      void send(props.initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", content: q, sources: [] }, { role: "assistant", content: "", sources: [], tools: [], pending: true }]);
    const patch = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1]!)]);
    let newId: string | null = null;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, message: q, mode, caseId: caseId || null, documentId: docId || null }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.type === "conversation") {
            if (!convId) newId = e.id;
            setConvId(e.id);
          } else if (e.type === "text") patch((m) => ({ ...m, content: m.content + e.delta }));
          else if (e.type === "tool") patch((m) => ({ ...m, tools: [...(m.tools ?? []), e.label] }));
          else if (e.type === "sources") patch((m) => ({ ...m, sources: e.sources }));
          else if (e.type === "done") patch((m) => ({ ...m, id: e.messageId, pending: false }));
          else if (e.type === "error") patch((m) => ({ ...m, pending: false, error: e.message }));
        }
      }
    } catch (err) {
      patch((m) => ({ ...m, pending: false, error: (err as Error).message }));
    } finally {
      patch((m) => ({ ...m, pending: false }));
      setBusy(false);
      if (newId) {
        window.history.replaceState(null, "", `/assistant?c=${newId}`);
        startTransition(() => router.refresh());
      }
    }
  }

  const scopeLabel = caseId ? props.cases.find((c) => c.id === caseId)?.title : docId ? props.docs.find((d) => d.id === docId)?.title : null;

  return (
    <div className="grid h-[calc(100vh-69px)] lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* History */}
      <aside className="hidden flex-col border-r border-line bg-white lg:flex">
        <div className="p-4">
          <Link href="/assistant" className="btn btn-secondary w-full"><MessageSquarePlus size={17} />New conversation</Link>
        </div>
        <div className="px-4 pb-2 text-[12px] font-semibold tracking-[0.04em] text-muted">Recent</div>
        <ul className="flex-1 overflow-y-auto px-2 pb-4">
          {props.history.map((h) => (
            <li key={h.id} className="group relative">
              <Link
                href={`/assistant?c=${h.id}`}
                className={cn("block rounded-lg px-3 py-2.5 pr-9 hover:bg-sunken", h.id === convId && "bg-accent-soft")}
              >
                <span className="block truncate text-[14px] font-medium">{h.title}</span>
                <span className="block truncate text-[12px] text-muted">{h.caseTitle ?? "All matters"}</span>
              </Link>
              <button
                aria-label={`Delete conversation ${h.title}`}
                onClick={() => startTransition(async () => {
                  await deleteConversation(h.id);
                  if (h.id === convId) router.push("/assistant");
                })}
                className="absolute right-1.5 top-2 hidden h-8 w-8 items-center justify-center rounded-md text-subtle hover:bg-chip hover:text-bad group-hover:flex"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
          {props.history.length === 0 && <li className="px-3 text-[13px] text-muted">Your conversations will appear here.</li>}
        </ul>
      </aside>

      {/* Conversation */}
      <section className="flex min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line bg-white px-4 py-3 lg:px-8">
          <div role="tablist" aria-label="Mode" className="flex rounded-[10px] bg-chip p-1">
            {MODES.map((m) => (
              <button key={m.id} role="tab" aria-selected={mode === m.id} title={m.hint} onClick={() => setMode(m.id)}
                className={cn("h-8 rounded-[7px] px-3 text-[13.5px] font-semibold", mode === m.id ? "bg-white text-text shadow-sm" : "text-muted")}>
                {m.label}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="scope-case">Matter</label>
          <select id="scope-case" className="input h-10 w-auto max-w-[240px]" value={caseId} onChange={(e) => { setCaseId(e.target.value); if (e.target.value) setDocId(""); }}>
            <option value="">All my matters</option>
            {props.cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <label className="sr-only" htmlFor="scope-doc">Document</label>
          <select id="scope-doc" className="input h-10 w-auto max-w-[240px]" value={docId} onChange={(e) => { setDocId(e.target.value); if (e.target.value) setCaseId(""); }}>
            <option value="">All documents</option>
            {props.docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <div className="mx-auto flex max-w-[820px] flex-col gap-6">
            {!props.status.ai && (
              <div className="flex gap-3 rounded-xl border border-mid/20 bg-mid-soft px-4 py-3 text-[13.5px] text-mid">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <p>AI is not configured. Start the AI service (<code className="font-mono">npm run ai:dev</code>) and set an LLM API key in <code className="font-mono">.env</code>. Search, cases, documents and everything else still work.</p>
              </div>
            )}
            {msgs.length === 0 && (
              <div className="flex flex-col gap-6 pt-6">
                <div>
                  <Sparkles className="text-accent" size={26} />
                  <h1 className="h1 mt-3">What do you need{scopeLabel ? ` on ${scopeLabel}` : ""}?</h1>
                  <p className="mt-2 text-muted">
                    LawAI answers from your matters, calendar, tasks, client files, documents and research library, and only from matters you can access. Every answer links to its sources.
                  </p>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {EXAMPLES.map(({ icon: Icon, text }) => (
                    <button key={text} onClick={() => send(text)} className="card flex items-start gap-3 p-4 text-left hover:border-line-strong">
                      <Icon size={18} className="mt-0.5 shrink-0 text-accent" />
                      <span className="text-[14px] font-medium">{text}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[12.5px] text-subtle">
                  Retrieval: {props.status.embeddings ? "hybrid (vector + keyword) with reranking" : "keyword search (add VOYAGE_API_KEY for semantic search)"}.
                </p>
              </div>
            )}
            {msgs.map((m, i) => (m.role === "user" ? <UserBubble key={i} text={m.content} /> : <AnswerCard key={i} m={m} />))}
            <div ref={endRef} />
          </div>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); void send(input); }}
          className="border-t border-line bg-white px-4 py-4 lg:px-8"
        >
          <div className="mx-auto flex max-w-[820px] items-end gap-2.5">
            <label htmlFor="chat-input" className="sr-only">Message LawAI</label>
            <textarea
              id="chat-input"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
              placeholder={mode === "draft" ? "Describe what to draft…" : mode === "research" ? "Ask a legal question…" : scopeLabel ? `Ask about ${scopeLabel}…` : "Ask about your matters, hearings, documents…"}
              className="input max-h-48 min-h-[52px] flex-1 py-3.5"
            />
            <button className="btn btn-primary h-[52px] w-[52px] px-0" disabled={busy || !input.trim()} aria-label="Send">
              {busy ? <Loader2 size={19} className="animate-spin" /> : <ArrowUp size={19} />}
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-[820px] text-[12px] text-subtle">LawAI can make mistakes. Check cited sources before relying on an answer.</p>
        </form>
      </section>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-3 text-[14.5px] text-white">{text}</div>
    </div>
  );
}

function AnswerCard({ m }: { m: Msg }) {
  const [rated, setRated] = useState<number | null | undefined>(m.feedback);
  const byRef = Object.fromEntries(m.sources.map((s) => [s.ref, s]));
  // Turn [S1] markers into links the markdown renderer can style as citation chips.
  const md = m.content.replace(/\[(S\d+)\](?!\()/g, (_, r) => `[${r}](#cite-${r})`);
  return (
    <article className="card flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-accent">
        <Sparkles size={16} /> LawAI
      </div>
      {!!m.tools?.length && (
        <ul className="flex flex-col gap-1.5">
          {m.tools.map((t, i) => (
            <li key={i} className="flex items-center gap-2 text-[13px] text-muted">
              {m.pending && i === m.tools!.length - 1 && !m.content ? <Loader2 size={14} className="animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-good" />}
              {t}
            </li>
          ))}
        </ul>
      )}
      {m.pending && !m.content && !m.tools?.length && <p className="flex items-center gap-2 text-muted"><Loader2 size={15} className="animate-spin" />Thinking…</p>}
      {m.content && (
        <div className="prose-ai text-[15px]">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                if (href?.startsWith("#cite-")) {
                  const s = byRef[href.slice(6)];
                  return (
                    <Link href={s?.href ?? "#"} title={s ? `${s.title}${s.subtitle ? " — " + s.subtitle : ""}` : undefined}
                      className="mx-0.5 inline-flex h-[20px] min-w-[26px] items-center justify-center rounded-md bg-accent-soft px-1.5 align-[1px] font-mono text-[11px] font-medium text-accent no-underline hover:bg-accent hover:text-white">
                      {children}
                    </Link>
                  );
                }
                return <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{children}</a>;
              },
            }}
          >
            {md}
          </ReactMarkdown>
        </div>
      )}
      {m.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13.5px] text-bad">{m.error}</p>}
      {m.sources.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <div className="text-[12px] font-semibold tracking-[0.04em] text-muted">Sources</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {m.sources.map((s) => {
              const Icon = SOURCE_ICON[s.kind] ?? FileText;
              return (
                <Link key={s.ref} href={s.href ?? "#"} className="flex items-start gap-2.5 rounded-lg border border-line p-2.5 hover:bg-sunken">
                  <span className="font-mono text-[11px] font-medium text-accent">{s.ref}</span>
                  <Icon size={15} className="mt-0.5 shrink-0 text-subtle" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold">{s.title}</span>
                    {s.subtitle && <span className="block truncate text-[12px] text-muted">{s.subtitle}</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
      {m.id && !m.pending && (
        <div className="flex gap-1">
          {([1, -1] as const).map((v) => (
            <button key={v} aria-label={v === 1 ? "Helpful" : "Not helpful"} aria-pressed={rated === v}
              onClick={() => { setRated(v); void rateMessage(m.id!, v); }}
              className={cn("flex h-9 w-9 items-center justify-center rounded-lg text-subtle hover:bg-chip", rated === v && "bg-accent-soft text-accent")}>
              {v === 1 ? <ThumbsUp size={15} /> : <ThumbsDown size={15} />}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
