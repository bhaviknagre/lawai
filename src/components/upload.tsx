"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const KINDS = ["Contract", "Pleading", "Evidence", "Correspondence", "Will", "Trust deed", "Policy", "Memo", "Other"];

export function Upload({ cases, defaultCaseId }: { cases: { id: string; title: string }[]; defaultCaseId?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [caseId, setCaseId] = useState(defaultCaseId ?? "");
  const [kind, setKind] = useState("Contract");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    fd.set("caseId", caseId);
    fd.set("kind", kind);
    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMsg({ ok: true, text: `Uploaded ${json.ids.length} file${json.ids.length === 1 ? "" : "s"}. Indexing for search and AI now.` });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div id="upload" className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap gap-3">
        <label className="label min-w-[200px] flex-1">Matter
          <select className="input" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            <option value="">Firm-wide (no matter)</option>{cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        <label className="label min-w-[160px]">Type
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        </label>
      </div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void upload(e.dataTransfer.files); }}
        disabled={busy}
        className={cn("flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors", over ? "border-accent bg-accent-soft" : "border-line-strong bg-sunken hover:border-accent")}
      >
        {busy ? <Loader2 className="animate-spin text-accent" /> : <FileUp className="text-accent" />}
        <span className="font-semibold">{busy ? "Uploading…" : "Drop files here or choose files"}</span>
        <span className="text-[13px] text-muted">PDF, DOCX, TXT or MD · up to 25 MB each · text is extracted, indexed and made searchable by LawAI</span>
      </button>
      <input ref={input} type="file" multiple accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => upload(e.target.files)} />
      {msg && <p role="status" className={cn("rounded-lg px-3 py-2 text-[13.5px]", msg.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad")}>{msg.text}</p>}
    </div>
  );
}

/** Re-renders the page every few seconds while something is still processing. */
export function AutoRefresh({ active, ms = 3000 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [active, ms, router]);
  return null;
}
