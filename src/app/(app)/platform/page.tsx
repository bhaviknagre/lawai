import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import { getPlatformOverview } from "@/lib/platform-stats";
import { money, PLANS, RENEWAL_WINDOW_DAYS, type Plan } from "@/lib/subscriptions";
import { Bars, PlanPill, RenewButtons, RenewalPill, Seats, Stat } from "@/components/platform";
import { Empty, PageHeader } from "@/components/ui";
import { ago, fmtDate } from "@/lib/utils";

export const metadata = { title: "Platform" };

/** LawAI operator overview: customers, seats, revenue, usage and upcoming renewals. */
export default async function PlatformOverview() {
  await requirePlatformAdmin();
  const o = await getPlatformOverview();
  const k = o.kpis;
  const urgent = o.renewals.filter((f) => f.renewal.days! <= 7);
  const maxPlan = Math.max(1, ...o.plans.map((p) => p.n));
  const maxUse = Math.max(1, ...o.topUsage.map((f) => f.aiActions30d));

  return (
    <>
      <PageHeader title="Platform overview" sub="Your customer firms, their seats, revenue and renewals. Each firm's matters and documents stay private to that firm.">
        <Link href="/platform/firms" className="btn btn-secondary">All firms</Link>
        <Link href="/platform/firms/new" className="btn btn-primary"><Plus size={17} /> Onboard a firm</Link>
      </PageHeader>

      {urgent.length > 0 && (
        <Link href="/platform/renewals" className="flex items-center gap-3 rounded-[14px] border border-bad-line/40 bg-bad-soft px-5 py-3.5 text-bad hover:underline">
          <AlertTriangle size={18} aria-hidden />
          <span className="text-[14px] font-semibold">
            {urgent.length} firm{urgent.length > 1 ? "s" : ""} expired or ending within 7 days: {urgent.slice(0, 3).map((f) => f.name).join(", ")}{urgent.length > 3 ? "…" : ""}
          </span>
        </Link>
      )}

      <section className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <Stat label="Customer firms" value={k.total} sub={`${k.active} active · ${k.suspended} suspended · ${k.newThisMonth} new this month`} />
        <Stat label="Paying / on trial" value={`${k.paying} / ${k.trials}`} sub="Paid plan with an unexpired term" />
        <Stat label="Monthly recurring revenue" value={money(k.mrr)} sub={`${money(k.mrr * 12)} a year`} tone="good" />
        <Stat label="Seats in use" value={k.seatsUsed} sub={k.seatsSold ? `of ${k.seatsSold} sold (${Math.round((k.seatsUsed / k.seatsSold) * 100)}%)` : "No seat limits set"} />
        <Stat label="Associates" value={k.people.associates} sub="Across active firms" />
        <Stat label="Paralegals" value={k.people.paralegals} sub="Across active firms" />
        <Stat label="Firm admins" value={k.people.admins} sub="Senior attorneys / partners" />
        <Stat label="AI actions, 30 days" value={k.aiActions30d.toLocaleString()} sub={k.dormant ? `${k.dormant} firm${k.dormant > 1 ? "s" : ""} idle for 14+ days` : "Every active firm used LawAI recently"} tone={k.dormant ? "bad" : undefined} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h2 className="h2">Renewal reminders</h2>
              <p className="text-[13px] text-muted">Expired, or ending in the next {RENEWAL_WINDOW_DAYS} days</p>
            </div>
            <Link href="/platform/renewals" className="link text-[14px]">All renewals</Link>
          </div>
          {o.renewals.length === 0 && <Empty title="Nothing due">No firm's term ends in the next {RENEWAL_WINDOW_DAYS} days.</Empty>}
          {o.renewals.slice(0, 8).map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/platform/firms/${f.id}`} className="font-semibold hover:underline">{f.name}</Link>
                <div className="text-[12.5px] text-muted">{PLANS[f.plan].label} · {f.monthlyFee ? `${money(f.monthlyFee)}/mo` : "no fee"} · ends {fmtDate(f.subscriptionEndsAt, "d MMM yyyy")}</div>
              </div>
              <RenewalPill r={f.renewal} />
              <RenewButtons firmId={f.id} name={f.name} />
            </div>
          ))}
        </section>

        <section className="card p-5">
          <h2 className="h2">Plan mix</h2>
          <p className="text-[13px] text-muted">Active firms by plan, with monthly revenue</p>
          <div className="mt-4 flex flex-col gap-3">
            {o.plans.length === 0 && <p className="text-muted">No active firms yet.</p>}
            {o.plans.map((p) => (
              <div key={p.plan} className="flex flex-col gap-1">
                <div className="flex justify-between text-[14px]">
                  <span>{PLANS[p.plan as Plan].label}</span>
                  <span><span className="font-semibold">{p.n}</span>{p.mrr > 0 && <span className="text-muted"> · {money(p.mrr)}/mo</span>}</span>
                </div>
                <div className="h-2.5 rounded-full bg-chip"><div className="h-2.5 rounded-full bg-ink" style={{ width: `${(p.n / maxPlan) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="h2">New firms per month</h2>
          <p className="text-[13px] text-muted">Last 12 months</p>
          <Bars data={o.signups} label="New firms per month" />
        </section>
        <section className="card p-5">
          <h2 className="h2">AI actions per week</h2>
          <p className="text-[13px] text-muted">Chat, review, drafting and research across all customers, last 12 weeks</p>
          <Bars data={o.usage} label="AI actions per week" />
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="h2">Most active firms</h2>
            <p className="text-[13px] text-muted">By AI actions in the last 30 days</p>
          </div>
          <Link href="/platform/firms" className="link text-[14px]">Full firm report</Link>
        </div>
        {o.topUsage.length === 0 && <Empty title="No firms yet" action={<Link href="/platform/firms/new" className="btn btn-primary">Onboard a firm</Link>} />}
        {o.topUsage.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-3 text-[14px]">
            <div className="min-w-[180px] flex-1">
              <Link href={`/platform/firms/${f.id}`} className="font-semibold hover:underline">{f.name}</Link>
              <div className="mt-1 h-2 rounded-full bg-chip"><div className="h-2 rounded-full bg-accent" style={{ width: `${(f.aiActions30d / maxUse) * 100}%` }} /></div>
            </div>
            <span className="w-24 text-right font-semibold">{f.aiActions30d.toLocaleString()}</span>
            <PlanPill plan={f.plan} />
            <span className="text-muted">Seats <Seats used={f.seatsUsed} limit={f.seatLimit} /></span>
            <span className="w-32 text-[13px] text-subtle">{f.lastActiveAt ? `Active ${ago(f.lastActiveAt)}` : "Never active"}</span>
          </div>
        ))}
      </section>
    </>
  );
}
