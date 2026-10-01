"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Result = { id: string; title: string; citation: string; court: string | null; jurisdiction: string; sourceType: string; year: number | null; summary: string; url: string | null };

export function Research({ jurisdictions, initialQuery, initialJur }: { jurisdictions: { code: string; short: string; name: string }[]; initialQuery?: string; initialJur: string[] }) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [jur, setJur] = useState<string[]>(initialJur);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ran = useRef(false);

  async function run(query = q) {
    if (query.trim().length < 3) return;
    setBusy(true); setErr(null);
    const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, jurisdictions: jur }) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(json.error);
    setAnswer(json.answer);
    setResults(json.results);
  }
  useEffect(() => { if (initialQuery && !ran.current) { ran.current = true; void run(initialQuery); } }, []); // eslint-disable-line

  const md = (answer ?? "").replace(/\[(\d+)\]/g, (_, n) => `[${n}](#r${n})`);
  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={(e) => { e.preventDefault(); void run(); }} className="card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-2.5">
          <label htmlFor="rq" className="sr-only">Research question</label>
          <input id="rq" className="input h-12 min-w-[240px] flex-1 text-[15px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Are lost profits recoverable for late delivery?" />
          <button className="btn btn-primary h-12" disabled={busy}>{busy ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}Research</button>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Jurisdictions">
          <span className="text-[13px] font-semibold text-muted">Jurisdictions:</span>
          {jurisdictions.map((j) => {
            const on = jur.includes(j.code);
            return (
              <button key={j.code} type="button" aria-pressed={on} title={j.name} onClick={() => setJur(on ? jur.filter((x) => x !== j.code) : [...jur, j.code])}
                className={cn("pill min-h-8 border px-3 font-mono text-[12px]", on ? "border-accent bg-accent-soft text-accent" : "border-line-strong bg-white text-muted")}>{j.short}</button>
            );
          })}
          {jur.length > 0 && <button type="button" className="link text-[13px]" onClick={() => setJur([])}>All</button>}
        </div>
      </form>
      {err && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-bad">{err}</p>}
      {answer && (
        <section className="card p-5">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-accent"><Sparkles size={16} />Research summary</div>
          <div className="prose-ai text-[15px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
              a: ({ href, children }) => href?.startsWith("#r")
                ? <a href={href} className="mx-0.5 inline-flex h-[20px] min-w-[22px] items-center justify-center rounded-md bg-accent-soft px-1.5 font-mono text-[11px] text-accent no-underline">{children}</a>
                : <a href={href}>{children}</a>,
            }}>{md}</ReactMarkdown>
          </div>
        </section>
      )}
      {results && (
        <section className="card overflow-hidden">
          <div className="px-5 py-4"><h2 className="h2">Authorities ({results.length})</h2></div>
          {results.map((r, i) => (
            <div key={r.id} id={`r${i + 1}`} className="flex gap-4 border-t border-[#eef0f3] px-5 py-4">
              <span className="font-mono text-[12px] text-accent">[{i + 1}]</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{r.title}</span><span className="tag">{r.jurisdiction}</span><span className="text-[12px] capitalize text-muted">{r.sourceType}</span></div>
                <div className="mt-0.5 font-mono text-[12.5px] text-muted">{r.citation}{r.court ? ` · ${r.court}` : ""}</div>
                <p className="mt-2 font-serif text-[15px] leading-relaxed">{r.summary}</p>
              </div>
            </div>
          ))}
          {results.length === 0 && <p className="border-t border-line px-5 py-6 text-muted">No authorities found. Try different words or widen the jurisdictions.</p>}
        </section>
      )}
    </div>
  );
}
