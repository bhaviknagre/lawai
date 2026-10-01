"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Sparkles, X } from "lucide-react";
import { acceptIssue, appendToDocument, dismissIssue, restoreVersion, saveDocumentText } from "@/app/actions/documents";
import { ActionForm } from "@/components/forms";
import { Pill } from "@/components/ui";
import { cn } from "@/lib/utils";

type Issue = { id: string; severity: "high" | "medium" | "low"; clauseRef: string | null; title: string; explanation: string; originalText: string | null; suggestedText: string | null; status: "open" | "accepted" | "dismissed" };
type Version = { version: number; note: string | null; who: string | null; at: string };
const TABS = ["Review", "Draft", "Edit", "History"] as const;

export function DocPanel({ docId, content, issues, versions, ai }: { docId: string; content: string; issues: Issue[]; versions: Version[]; ai: boolean }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Review");
  return (
    <aside className="card flex flex-col overflow-hidden xl:sticky xl:top-[88px] xl:max-h-[calc(100vh-110px)]">
      <div role="tablist" className="flex border-b border-line px-2">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn("h-12 border-b-2 px-3.5 text-[14px] font-semibold", tab === t ? "border-accent text-accent" : "border-transparent text-muted hover:text-text")}>
            {t}{t === "Review" && issues.filter((i) => i.status === "open").length ? <span className="ml-1.5 rounded-full bg-bad-soft px-1.5 text-[11px] text-bad">{issues.filter((i) => i.status === "open").length}</span> : null}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "Review" && <Review docId={docId} issues={issues} ai={ai} />}
        {tab === "Draft" && <Draft docId={docId} ai={ai} />}
        {tab === "Edit" && (
          <div className="p-4">
            <ActionForm action={saveDocumentText.bind(null, docId)} submitLabel="Save as new version" resetOnSuccess={false} successText="Saved. Re-indexing for search.">
              <textarea name="content" defaultValue={content} rows={22} className="input font-serif text-[14px]" aria-label="Document text" />
              <input name="note" className="input" placeholder="What changed? (optional)" aria-label="Version note" />
            </ActionForm>
          </div>
        )}
        {tab === "History" && <History docId={docId} versions={versions} />}
      </div>
    </aside>
  );
}

function Review({ docId, issues, ai }: { docId: string; issues: Issue[]; ai: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [side, setSide] = useState("");
  const [pending, start] = useTransition();
  const open = issues.filter((i) => i.status === "open");
  const closed = issues.filter((i) => i.status !== "open");
  async function run() {
    setRunning(true); setErr(null);
    const res = await fetch(`/api/documents/${docId}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ourSide: side || undefined }) });
    const json = await res.json();
    setRunning(false);
    if (!res.ok) setErr(json.error); else router.refresh();
  }
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2.5 border-b border-line p-4">
        <p className="text-[13.5px] text-muted">Checks the document against your firm playbook for this document type and suggests exact redlines.</p>
        <input className="input" value={side} onChange={(e) => setSide(e.target.value)} placeholder="We act for… (optional, e.g. the Customer)" aria-label="Which side we act for" />
        <button className="btn btn-primary" onClick={run} disabled={running || !ai}>
          {running ? <><Loader2 size={16} className="animate-spin" />Reviewing…</> : <><Sparkles size={16} />{issues.length ? "Run review again" : "Run AI review"}</>}
        </button>
        {!ai && <p className="text-[12.5px] text-mid">Configure the AI service to enable AI review.</p>}
        {err && <p role="alert" className="text-[13px] text-bad">{err}</p>}
      </div>
      {open.map((i) => (
        <div key={i.id} className={cn("flex flex-col gap-2 border-b border-line p-4", pending && "opacity-60")}>
          <div className="flex items-center gap-2">
            <Pill tone={i.severity === "high" ? "bad" : i.severity === "medium" ? "mid" : "neutral"} className="capitalize">{i.severity}</Pill>
            {i.clauseRef && <span className="tag">{i.clauseRef}</span>}
          </div>
          <div className="font-semibold">{i.title}</div>
          <p className="text-[13.5px] leading-relaxed text-muted">{i.explanation}</p>
          {i.originalText && <p className="rounded-lg bg-bad-soft px-3 py-2 font-serif text-[13.5px] text-bad line-through decoration-1">{i.originalText}</p>}
          {i.suggestedText && <p className="rounded-lg bg-good-soft px-3 py-2 font-serif text-[13.5px] text-good">{i.suggestedText}</p>}
          <div className="flex gap-2">
            {i.suggestedText && <button className="btn btn-primary btn-sm" onClick={() => start(() => acceptIssue(i.id))}><Check size={15} />Accept change</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => start(() => dismissIssue(i.id))}><X size={15} />Dismiss</button>
          </div>
        </div>
      ))}
      {open.length === 0 && <p className="p-4 text-[13.5px] text-muted">{issues.length ? "All findings resolved." : "Not reviewed yet."}</p>}
      {closed.length > 0 && (
        <details className="p-4">
          <summary className="cursor-pointer text-[13px] font-semibold text-muted">Resolved ({closed.length})</summary>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
            {closed.map((i) => <li key={i.id} className="flex gap-2"><span className={i.status === "accepted" ? "text-good" : "text-subtle"}>{i.status === "accepted" ? "Accepted" : "Dismissed"}</span>{i.title}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function Draft({ docId, ai }: { docId: string; ai: boolean }) {
  const [instruction, setInstruction] = useState("");
  const [tone, setTone] = useState("Balanced");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  async function draft() {
    setBusy(true); setErr(null); setDone(false);
    const res = await fetch("/api/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction, tone, documentId: docId }) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) setErr(json.error); else setOut(json.text);
  }
  return (
    <div className="flex flex-col gap-3 p-4">
      <label className="label">What should LawAI draft?
        <textarea className="input" rows={4} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. Add a mutual non-solicitation clause for 12 months after termination" />
      </label>
      <label className="label">Position
        <select className="input" value={tone} onChange={(e) => setTone(e.target.value)}>
          <option>Balanced</option><option>Favourable to our client</option><option>Firm but commercial</option><option>Plain English</option>
        </select>
      </label>
      <button className="btn btn-primary" onClick={draft} disabled={busy || !ai || instruction.trim().length < 5}>
        {busy ? <><Loader2 size={16} className="animate-spin" />Drafting…</> : <><Sparkles size={16} />Draft</>}
      </button>
      {!ai && <p className="text-[12.5px] text-mid">Configure the AI service to enable drafting.</p>}
      {err && <p role="alert" className="text-[13px] text-bad">{err}</p>}
      {out && (
        <>
          <textarea className="input font-serif text-[14px]" rows={10} value={out} onChange={(e) => setOut(e.target.value)} aria-label="Drafted text" />
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(async () => { await appendToDocument(docId, out); setDone(true); })}><Check size={15} />Insert at end</button>
            <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(out)}><Copy size={15} />Copy</button>
          </div>
          {done && <p role="status" className="text-[13px] text-good">Inserted as a new version.</p>}
        </>
      )}
    </div>
  );
}

function History({ docId, versions }: { docId: string; versions: Version[] }) {
  const [pending, start] = useTransition();
  return (
    <ul className="flex flex-col">
      {versions.map((v, i) => (
        <li key={v.version} className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="tag">v{v.version}</span>
          <span className="min-w-0 flex-1 text-[13.5px]"><span className="block truncate font-medium">{v.note ?? "Saved"}</span><span className="text-[12px] text-muted">{v.who ?? "System"} · {new Date(v.at).toLocaleString()}</span></span>
          {i > 0 && <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(() => restoreVersion(docId, v.version))}>Restore</button>}
        </li>
      ))}
      {versions.length === 0 && <li className="p-4 text-[13.5px] text-muted">No saved versions yet. Edits and accepted redlines create versions.</li>}
    </ul>
  );
}
