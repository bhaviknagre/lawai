import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listClients } from "@/lib/queries/clients";
import { Avatar, Empty, PageHeader, Pill } from "@/components/ui";
import { ago, CLIENT_TYPE_LABEL, cn } from "@/lib/utils";

export const metadata = { title: "Clients" };
const TYPES = ["company", "individual", "trust", "estate"] as const;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const rows = await listClients(user, sp);
  return (
    <>
      <PageHeader title="Clients" sub={`${rows.length} client${rows.length === 1 ? "" : "s"}`}>
        <Link href="/clients/new" className="btn btn-primary"><Plus size={18} />New client</Link>
      </PageHeader>
      <form action="/clients" className="flex flex-wrap items-center gap-2">
        <input className="input max-w-sm" name="q" defaultValue={sp.q} placeholder="Search name, contact, email or city" aria-label="Search clients" />
        <Link href="/clients" className={cn("pill min-h-9 border px-3.5", !sp.type ? "border-ink bg-ink text-white" : "border-line-strong bg-white")}>All</Link>
        {TYPES.map((t) => (
          <Link key={t} href={`/clients?type=${t}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} className={cn("pill min-h-9 border px-3.5", sp.type === t ? "border-ink bg-ink text-white" : "border-line-strong bg-white")}>{CLIENT_TYPE_LABEL[t]}</Link>
        ))}
      </form>
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-sunken"><tr className="th">{["Client", "Type", "Primary contact", "Open matters", "Last activity"].map((h) => <th key={h} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(({ c, activeMatters, lastActivity }) => (
                <tr key={c.id} className="border-t border-[#eef0f3] hover:bg-sunken/60">
                  <td className="px-5 py-3"><Link href={`/clients/${c.id}`} className="flex items-center gap-3"><Avatar name={c.name} size={34} color="#3A4A66" /><span><span className="block font-semibold">{c.name}</span><span className="block text-[13px] text-muted">{c.location}</span></span></Link></td>
                  <td className="px-5 py-3"><Pill>{CLIENT_TYPE_LABEL[c.type]}</Pill></td>
                  <td className="px-5 py-3">{c.primaryContact ?? "—"}{c.contactTitle && <div className="text-[13px] text-muted">{c.contactTitle}</div>}</td>
                  <td className="px-5 py-3 font-semibold">{activeMatters}</td>
                  <td className="px-5 py-3 text-muted">{lastActivity ? ago(lastActivity) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty title="No clients found" action={<Link href="/clients/new" className="btn btn-secondary btn-sm">Add a client</Link>} />}
        </div>
      </section>
    </>
  );
}
