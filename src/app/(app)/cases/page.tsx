import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listCases } from "@/lib/queries/cases";
import { getFirmUsers, getJurisdictions } from "@/lib/queries/common";
import { Avatar, Empty, PageHeader, Pill, priorityTone } from "@/components/ui";
import { CASE_STATUS_LABEL, PRIORITY_LABEL, fmtTime, relDay, cn } from "@/lib/utils";

export const metadata = { title: "Cases" };

type SP = { q?: string; area?: string; jurisdiction?: string; priority?: string; status?: string; assignee?: string; page?: string };

export default async function CasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const [data, jur, people] = await Promise.all([listCases(user, { ...sp, page: Number(sp.page) || 1 }), getJurisdictions(), getFirmUsers(user.firmId)]);
  const J = Object.fromEntries(jur.map((j) => [j.code, j]));
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/cases?${p}`;
  };
  return (
    <>
      <PageHeader title="Cases" sub={`${data.total} ${sp.status === "closed" ? "closed" : sp.status === "all" ? "" : "open"} matters you can access`}>
        <Link href="/assistant" className="btn btn-secondary"><Sparkles size={17} />Ask about a case</Link>
        <Link href="/cases/new" className="btn btn-primary"><Plus size={18} />New case</Link>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <Link href={qs({ area: undefined, page: undefined })} className={cn("pill min-h-9 border px-3.5", !sp.area ? "border-ink bg-ink text-white" : "border-line-strong bg-white text-text")}>All areas</Link>
        {data.areas.map((a) => (
          <Link key={a.area} href={qs({ area: a.area, page: undefined })} className={cn("pill min-h-9 border px-3.5", sp.area === a.area ? "border-ink bg-ink text-white" : "border-line-strong bg-white text-text")}>
            {a.area} <span className="opacity-60">{a.n}</span>
          </Link>
        ))}
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4" action="/cases">
        {sp.area && <input type="hidden" name="area" value={sp.area} />}
        <label className="label min-w-[220px] flex-[2]">Search<input className="input" name="q" defaultValue={sp.q} placeholder="Case, number, client or opposing party" /></label>
        <label className="label min-w-[150px] flex-1">Jurisdiction
          <select className="input" name="jurisdiction" defaultValue={sp.jurisdiction ?? ""}>
            <option value="">All</option>{jur.map((j) => <option key={j.code} value={j.code}>{j.name}</option>)}
          </select>
        </label>
        <label className="label min-w-[130px] flex-1">Priority
          <select className="input" name="priority" defaultValue={sp.priority ?? ""}><option value="">All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        </label>
        <label className="label min-w-[150px] flex-1">Team member
          <select className="input" name="assignee" defaultValue={sp.assignee ?? ""}><option value="">Anyone</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <label className="label min-w-[130px] flex-1">Status
          <select className="input" name="status" defaultValue={sp.status ?? ""}><option value="">Open</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="closed">Closed</option><option value="all">All</option></select>
        </label>
        <button className="btn btn-primary">Apply</button>
        <Link href="/cases" className="btn btn-ghost">Clear</Link>
      </form>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left">
            <thead className="bg-sunken">
              <tr className="th">
                {["Case", "Client", "Jurisdiction", "Stage", "Priority", "Next event", "Team"].map((h) => <th key={h} className="px-5 py-3 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.rows.map(({ c, client, clientId, nextAt, nextTitle, team }) => (
                <tr key={c.id} className="border-t border-[#eef0f3] align-top hover:bg-sunken/60">
                  <td className="px-5 py-3.5">
                    <Link href={`/cases/${c.id}`} className="font-semibold hover:underline">{c.title}</Link>
                    <div className="mt-0.5 font-mono text-[12px] text-muted">{c.caseNumber} · {c.practiceArea}</div>
                  </td>
                  <td className="px-5 py-3.5"><Link href={`/clients/${clientId}`} className="hover:underline">{client}</Link></td>
                  <td className="px-5 py-3.5"><span className="tag">{J[c.jurisdiction]?.short}</span></td>
                  <td className="px-5 py-3.5">{c.status === "active" ? c.stage : <Pill tone="neutral">{CASE_STATUS_LABEL[c.status]}</Pill>}</td>
                  <td className="px-5 py-3.5"><Pill tone={priorityTone(c.priority)}>{PRIORITY_LABEL[c.priority]}</Pill></td>
                  <td className="px-5 py-3.5">
                    {nextAt ? (<><div className="font-semibold">{relDay(nextAt)} · {fmtTime(nextAt)}</div><div className="text-[13px] text-muted">{nextTitle}</div></>) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex -space-x-1.5">{team.map((t) => <Avatar key={t.name} name={t.name} color={t.color} size={28} className="ring-2 ring-white" />)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length === 0 && <Empty title="No cases match these filters" action={<Link href="/cases" className="btn btn-secondary btn-sm">Clear filters</Link>} />}
        </div>
        {data.pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13.5px]">
            <span className="text-muted">Page {data.page} of {data.pages}</span>
            <div className="flex gap-2">
              {data.page > 1 && <Link className="btn btn-secondary btn-sm" href={qs({ page: String(data.page - 1) })}>Previous</Link>}
              {data.page < data.pages && <Link className="btn btn-secondary btn-sm" href={qs({ page: String(data.page + 1) })}>Next</Link>}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
