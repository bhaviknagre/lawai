import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDocument } from "@/lib/queries/documents";
import { aiStatus } from "@/lib/ai-service";
import { deleteDocument, reingest, setDocStatus } from "@/app/actions/documents";
import { AutoRefresh } from "@/components/upload";
import { Pill, docStatusTone } from "@/components/ui";
import { ago, bytes, DOC_STATUS_LABEL } from "@/lib/utils";
import { DocPanel } from "./panel";

/** Split text so open-issue passages can be highlighted. */
function segments(text: string, marks: { text: string; severity: string }[]) {
  const hits = marks
    .map((m) => ({ ...m, at: text.indexOf(m.text) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at);
  const out: { t: string; sev?: string }[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.at < pos) continue;
    out.push({ t: text.slice(pos, h.at) }, { t: h.text, sev: h.severity });
    pos = h.at + h.text.length;
  }
  out.push({ t: text.slice(pos) });
  return out;
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const doc = await getDocument(user, id);
  if (!doc) notFound();
  const { d } = doc;
  const busy = d.ingestStatus === "pending" || d.ingestStatus === "processing";
  const open = doc.issues.filter((i) => i.status === "open" && i.originalText);
  return (
    <>
      <AutoRefresh active={busy} />
      <div className="flex flex-col gap-2">
        <Link href="/documents" className="link text-[13.5px]">Documents</Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="h1 break-words">{d.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-muted">
              <Pill tone={docStatusTone(d.status)}>{DOC_STATUS_LABEL[d.status]}</Pill>
              <span>{d.kind} · v{d.version} · {bytes(d.sizeBytes)}</span>
              {d.caseId && <>· <Link href={`/cases/${d.caseId}`} className="link">{doc.caseTitle}</Link></>}
              <span>· updated {ago(d.updatedAt)}{doc.uploader ? ` by ${doc.uploader}` : ""}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/assistant?doc=${d.id}`} className="btn btn-primary"><Sparkles size={17} />Ask about this document</Link>
            <a href={`/api/documents/${d.id}/file`} className="btn btn-secondary"><Download size={17} />Download</a>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-muted">Set status:</span>
        {(["draft", "in_review", "final", "signed", "filed"] as const).map((s) => (
          <form key={s} action={setDocStatus.bind(null, d.id, s)}>
            <button className={`pill min-h-8 border px-3 ${d.status === s ? "border-ink bg-ink text-white" : "border-line-strong bg-white"}`}>{DOC_STATUS_LABEL[s]}</button>
          </form>
        ))}
      </div>

      {d.ingestStatus === "failed" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-soft px-4 py-3 text-bad">
          <span className="flex-1 text-[14px]">LawAI couldn't read this file: {d.ingestError}</span>
          <form action={reingest.bind(null, d.id)}><button className="btn btn-secondary btn-sm"><RefreshCw size={15} />Try again</button></form>
        </div>
      )}
      {busy && <p className="flex items-center gap-2 text-[14px] text-muted"><Loader2 size={15} className="animate-spin" />Indexing: extracting text, splitting into clauses and embedding for search…</p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-4">
          {d.summary && (
            <section className="card flex gap-3 p-4">
              <Sparkles size={18} className="mt-0.5 shrink-0 text-accent" />
              <p className="text-[14px] leading-relaxed">{d.summary}</p>
            </section>
          )}
          <article className="card px-6 py-8 sm:px-12">
            <div className="mx-auto max-w-[72ch] whitespace-pre-wrap font-serif text-[16px] leading-[1.75]">
              {d.content
                ? segments(d.content, open.map((i) => ({ text: i.originalText!, severity: i.severity }))).map((s, i) =>
                    s.sev ? <mark key={i} className={s.sev === "high" ? "rounded bg-bad-soft px-0.5 text-bad underline decoration-bad-line decoration-2" : "rounded bg-mid-soft px-0.5 text-mid"}>{s.t}</mark> : <span key={i}>{s.t}</span>,
                  )
                : <span className="font-sans text-muted">No text yet.</span>}
            </div>
          </article>
          <form action={deleteDocument.bind(null, d.id)} className="self-start">
            <button className="btn btn-ghost btn-sm text-bad"><Trash2 size={15} />Delete document</button>
          </form>
        </div>
        <DocPanel
          docId={d.id}
          content={d.content ?? ""}
          ai={(await aiStatus()).ai}
          issues={doc.issues.map((i) => ({ id: i.id, severity: i.severity, clauseRef: i.clauseRef, title: i.title, explanation: i.explanation, originalText: i.originalText, suggestedText: i.suggestedText, status: i.status }))}
          versions={doc.versions.map(({ v, who }) => ({ version: v.version, note: v.note, who, at: v.createdAt.toISOString() }))}
        />
      </div>
    </>
  );
}
