"use client";
import { useState, useTransition } from "react";
import { Loader2, Save, Sparkles } from "lucide-react";
import { createDraftDocument } from "@/app/actions/documents";

const TEMPLATES = [
  "Mutual NDA between our client and a prospective supplier, New York law, 3-year term",
  "Letter before action for unpaid invoices of [AMOUNT], 14 days to pay",
  "Engagement letter for a commercial lease review, fixed fee",
  "Board resolution approving a distributor agreement",
];

export function NewDraft({ cases, ai }: { cases: { id: string; title: string }[]; ai: boolean }) {
  const [title, setTitle] = useState("");
  const [caseId, setCaseId] = useState("");
  const [kind, setKind] = useState("Contract");
  const [instruction, setInstruction] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, start] = useTransition();

  async function draft() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction, kind: "document" }) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(json.error);
    setText(json.text);
    if (!title) setTitle(json.text.split("\n")[0].slice(0, 80).replace(/[^\w\s&,.-]/g, "").trim());
  }

  return (
    <section className="card flex flex-col gap-4 p-5">
      <h2 className="h2">New AI draft</h2>
      <label className="label">Describe the document
        <textarea className="input" rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Parties, governing law, key commercial terms, which side we act for" />
      </label>
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((t) => <button key={t} type="button" onClick={() => setInstruction(t)} className="pill min-h-8 border border-line-strong bg-white px-3 text-left hover:border-accent">{t}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" onClick={draft} disabled={busy || !ai || instruction.trim().length < 5}>
          {busy ? <><Loader2 size={16} className="animate-spin" />Drafting…</> : <><Sparkles size={16} />Draft document</>}
        </button>
        {!ai && <span className="text-[13px] text-mid">Configure the AI service to enable drafting.</span>}
        {err && <span role="alert" className="text-[13px] text-bad">{err}</span>}
      </div>
      {text && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="label">Title<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="label">Matter
              <select className="input" value={caseId} onChange={(e) => setCaseId(e.target.value)}><option value="">Firm-wide</option>{cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
            </label>
            <label className="label">Type
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{["Contract", "Correspondence", "Pleading", "Memo", "Other"].map((k) => <option key={k}>{k}</option>)}</select>
            </label>
          </div>
          <textarea className="input font-serif text-[15px] leading-relaxed" rows={18} value={text} onChange={(e) => setText(e.target.value)} aria-label="Draft text" />
          <button className="btn btn-primary self-start" disabled={saving} onClick={() => start(() => createDraftDocument({ title, content: text, caseId: caseId || null, kind }))}>
            <Save size={16} />{saving ? "Saving…" : "Save as document"}
          </button>
        </div>
      )}
    </section>
  );
}
