import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import { FIRM_FILTERS as FILTERS, getFirmStats } from "@/lib/platform-stats";
import { money } from "@/lib/subscriptions";
import { PlanPill, RenewalPill, Seats, Tabs } from "@/components/platform";
import { Empty, PageHeader } from "@/components/ui";
import { ago } from "@/lib/utils";

export const metadata = { title: "Firms" };

/** Per-firm business report: plan, renewal, seats, team make-up and usage. */
export default async function FirmsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePlatformAdmin();
  const { status } = await searchParams;
  const filter = FILTERS.find((f) => f.id === status) ?? FILTERS[0]!;
  const all = await getFirmStats();
  const rows = all.filter(filter.match);

  return (
    <>
      <PageHeader title="Firms" sub="Every customer firm with its plan, renewal date, seats, team and usage.">
        <a href={`/platform/firms/export${filter.id === "all" ? "" : `?status=${filter.id}`}`} className="btn btn-secondary"><Download size={17} /> Export CSV</a>
        <Link href="/platform/firms/new" className="btn btn-primary"><Plus size={17} /> Onboard a firm</Link>
      </PageHeader>
      <Tabs current={filter.id} items={FILTERS.map((f) => ({ id: f.id, label: f.label, n: all.filter(f.match).length, href: f.id === "all" ? "/platform/firms" : `/platform/firms?status=${f.id}` }))} />

      <section className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty title="No firms here" />
        ) : (
          <table className="w-full min-w-[1080px] text-left text-[14px]">
            <thead className="bg-sunken text-[12.5px] text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Firm</th>
                <th className="px-3 py-3 font-semibold">Plan</th>
                <th className="px-3 py-3 font-semibold">Renewal</th>
                <th className="px-3 py-3 text-right font-semibold">Fee / mo</th>
                <th className="px-3 py-3 text-right font-semibold">Seats</th>
                <th className="px-3 py-3 text-right font-semibold">Admins</th>
                <th className="px-3 py-3 text-right font-semibold">Associates</th>
                <th className="px-3 py-3 text-right font-semibold">Paralegals</th>
                <th className="px-3 py-3 text-right font-semibold">Clients</th>
                <th className="px-3 py-3 text-right font-semibold">Open cases</th>
                <th className="px-3 py-3 text-right font-semibold">AI, 30d</th>
                <th className="px-5 py-3 font-semibold">Last active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className="border-t border-line hover:bg-sunken/60">
                  <td className="px-5 py-3">
                    <Link href={`/platform/firms/${f.id}`} className="font-semibold hover:underline">{f.name}</Link>
                    <div className="text-[12.5px] text-subtle">{f.slug}{f.pendingInvites > 0 && ` · ${f.pendingInvites} invite${f.pendingInvites > 1 ? "s" : ""} pending`}</div>
                  </td>
                  <td className="px-3 py-3"><PlanPill plan={f.plan} /></td>
                  <td className="px-3 py-3"><RenewalPill r={f.renewal} /></td>
                  <td className="px-3 py-3 text-right">{f.monthlyFee ? money(f.monthlyFee) : "—"}</td>
                  <td className="px-3 py-3 text-right"><Seats used={f.seatsUsed} limit={f.seatLimit} /></td>
                  <td className="px-3 py-3 text-right">{f.team.admins}</td>
                  <td className="px-3 py-3 text-right">{f.team.associates}</td>
                  <td className="px-3 py-3 text-right">{f.team.paralegals}</td>
                  <td className="px-3 py-3 text-right">{f.clients}</td>
                  <td className="px-3 py-3 text-right">{f.openCases}</td>
                  <td className="px-3 py-3 text-right">{f.aiActions30d.toLocaleString()}</td>
                  <td className="px-5 py-3 text-[13px] text-muted">{f.lastActiveAt ? ago(f.lastActiveAt) : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
