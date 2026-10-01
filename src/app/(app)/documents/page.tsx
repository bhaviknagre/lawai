import Link from "next/link";
import { Loader2, PenLine } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listDocuments } from "@/lib/queries/documents";
import { caseOptions } from "@/lib/queries/cases";
import { AutoRefresh, Upload } from "@/components/upload";
import { DocIcon, Empty, PageHeader, Pill, docStatusTone } from "@/components/ui";
import { ago, bytes, cn, DOC_STATUS_LABEL, fileExt } from "@/lib/utils";

export const metadata = { title: "Documents" };
type SP = { q?: string; kind?: string; case?: string; status?: string; ingest?: string };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const [data, cases] = await Promise.all([listDocuments(user, sp), caseOptions(user)]);
  const processing = data.rows.some((r) => r.d.ingestStatus === "pending" || r.d.ingestStatus === "processing");
  const link = (patch: Partial<SP>) => `/documents?${new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][])}`;
  return (
    <>
      <AutoRefresh active={processing} />
      <PageHeader title="Documents" sub={`${data.total} documents · full text is searchable and available to LawAI`}>
        <Link href="/drafting" className="btn btn-secondary"><PenLine size={17} />Draft with AI</Link>
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="card h-fit p-3">
          <div className="th px-2 pb-2">Folders</div>
          <Link href={link({ kind: undefined })} className={cn("flex justify-between rounded-lg px-2.5 py-2 text-[14px]", !sp.kind ? "bg-accent-soft font-semibold text-accent" : "hover:bg-sunken")}>All documents <span>{data.total}</span></Link>
          {data.kinds.map((k) => (
            <Link key={k.kind} href={link({ kind: k.kind })} className={cn("flex justify-between rounded-lg px-2.5 py-2 text-[14px]", sp.kind === k.kind ? "bg-accent-soft font-semibold text-accent" : "hover:bg-sunken")}>{k.kind} <span className="text-muted">{k.n}</span></Link>
          ))}
        </aside>
        <div className="flex min-w-0 flex-col gap-4">
          <Upload cases={cases} defaultCaseId={sp.case} />
          <form action="/documents" className="flex flex-wrap gap-2">
            {sp.kind && <input type="hidden" name="kind" value={sp.kind} />}
            <input className="input min-w-[220px] flex-1" name="q" defaultValue={sp.q} placeholder="Search titles and full text" aria-label="Search documents" />
            <select className="input w-auto" name="case" defaultValue={sp.case ?? ""} aria-label="Matter"><option value="">All matters</option>{cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
            <select className="input w-auto" name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">Any status</option>{Object.entries(DOC_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <button className="btn btn-secondary">Filter</button>
          </form>
          <section className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left">
                <thead className="bg-sunken"><tr className="th">{["Document", "Matter", "Status", "AI review", "Updated"].map((h) => <th key={h} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
                <tbody>
                  {data.rows.map(({ d, caseTitle, issues, high, reviewed }) => (
                    <tr key={d.id} className="border-t border-[#eef0f3] hover:bg-sunken/60">
                      <td className="px-5 py-3">
                        <Link href={`/documents/${d.id}`} className="flex items-center gap-3">
                          <DocIcon ext={fileExt(d.title, d.mimeType)} />
                          <span className="min-w-0"><span className="block max-w-[340px] truncate font-semibold">{d.title}</span><span className="block text-[13px] text-muted">{d.kind} · v{d.version} · {bytes(d.sizeBytes)}</span></span>
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-[14px]">{caseTitle ?? <span className="text-muted">Firm-wide</span>}</td>
                      <td className="px-5 py-3"><Pill tone={docStatusTone(d.status)}>{DOC_STATUS_LABEL[d.status]}</Pill></td>
                      <td className="px-5 py-3 text-[13.5px]">
                        {d.ingestStatus === "failed" ? <span className="font-semibold text-bad">Couldn't read file</span>
                          : d.ingestStatus !== "ready" ? <span className="flex items-center gap-1.5 text-muted"><Loader2 size={14} className="animate-spin" />Indexing</span>
                          : issues ? <span className={high ? "font-semibold text-bad" : "font-semibold text-mid"}>{issues} open finding{issues === 1 ? "" : "s"}</span>
                          : reviewed ? <span className="text-good">No open findings</span> : <span className="text-muted">Not reviewed</span>}
                      </td>
                      <td className="px-5 py-3 text-[13.5px] text-muted">{ago(d.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.rows.length === 0 && <Empty title="No documents match">Upload a file above, or clear the filters.</Empty>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
