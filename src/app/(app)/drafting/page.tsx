import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listDocuments } from "@/lib/queries/documents";
import { caseOptions } from "@/lib/queries/cases";
import { aiStatus } from "@/lib/ai-service";
import { DocIcon, Empty, PageHeader, Pill, docStatusTone } from "@/components/ui";
import { ago, DOC_STATUS_LABEL, fileExt } from "@/lib/utils";
import { NewDraft } from "./new-draft";

export const metadata = { title: "Drafting & review" };

export default async function DraftingPage() {
  const user = await requireUser();
  const [inReview, drafts, cases, status] = await Promise.all([listDocuments(user, { status: "in_review" }), listDocuments(user, { status: "draft" }), caseOptions(user), aiStatus()]);
  const rows = [...inReview.rows, ...drafts.rows];
  return (
    <>
      <PageHeader title="Drafting & review" sub="Draft new documents, or open one to review it against your playbook and accept redlines." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <NewDraft cases={cases} ai={status.ai} />
        <section className="card h-fit overflow-hidden">
          <div className="px-5 py-4"><h2 className="h2">In progress ({rows.length})</h2></div>
          {rows.map(({ d, caseTitle, issues, high }) => (
            <Link key={d.id} href={`/documents/${d.id}`} className="flex items-center gap-3.5 border-t border-[#eef0f3] px-5 py-3 hover:bg-sunken">
              <DocIcon ext={fileExt(d.title, d.mimeType)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{d.title}</span>
                <span className="block text-[13px] text-muted">{caseTitle ?? "Firm-wide"} · {ago(d.updatedAt)}</span>
              </span>
              {issues > 0 && <Pill tone={high ? "bad" : "mid"}>{issues} finding{issues === 1 ? "" : "s"}</Pill>}
              <Pill tone={docStatusTone(d.status)}>{DOC_STATUS_LABEL[d.status]}</Pill>
            </Link>
          ))}
          {rows.length === 0 && <Empty title="Nothing in draft or review" />}
        </section>
      </div>
    </>
  );
}
