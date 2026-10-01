import Link from "next/link";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { getReports, type Period } from "@/lib/queries/reports";
import { Avatar, PageHeader, Pill } from "@/components/ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reports" };
const PERIODS: { id: Period; label: string }[] = [{ id: "quarter", label: "This quarter" }, { id: "last_quarter", label: "Last quarter" }, { id: "ytd", label: "Year to date" }];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: p } = await searchParams;
  const period = (PERIODS.find((x) => x.id === p)?.id ?? "quarter") as Period;
  const user = await requireUser();
  const r = await getReports(user, period);
  const maxW = Math.max(1, ...r.weekly.map((w) => w.hours));
  const maxA = Math.max(1, ...r.areas.map((a) => a.n));
  return (
    <>
      <PageHeader title="Reports" sub={`${format(r.period.from, "d MMM yyyy")} to ${format(r.period.to, "d MMM yyyy")} · compared with the previous period`}>
        <div className="flex rounded-[10px] bg-chip p-1">
          {PERIODS.map((x) => <Link key={x.id} href={`/reports?period=${x.id}`} className={cn("flex h-9 items-center rounded-[7px] px-3 text-[13.5px] font-semibold", period === x.id ? "bg-white shadow-sm" : "text-muted")}>{x.label}</Link>)}
        </div>
      </PageHeader>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {r.kpis.map((k) => (
          <div key={k.label} className="card flex flex-col gap-3 p-5">
            <span className="font-medium text-muted">{k.label}</span>
            <span className="font-display text-[32px] font-bold leading-none">{k.value}</span>
            <Pill tone={k.good === null ? "neutral" : k.good ? "good" : "bad"} className="self-start">{k.delta}</Pill>
          </div>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card p-5">
          <h2 className="h2">Billable hours per week</h2>
          <p className="text-[13px] text-muted">Last 13 weeks, whole firm</p>
          <div className="mt-5 flex h-56 items-end gap-2" role="img" aria-label="Bar chart of weekly billable hours">
            {r.weekly.map((w, i) => (
              <div key={w.label} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[11px] font-semibold text-muted">{w.hours}</span>
                <div className={cn("w-full rounded-t-md", i === r.weekly.length - 1 ? "bg-accent" : "bg-[#c9d0f5]")} style={{ height: `${(w.hours / maxW) * 180}px` }} />
                <span className="text-[10.5px] text-subtle">{w.label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="h2">Open matters by practice area</h2>
          <div className="mt-4 flex flex-col gap-3">
            {r.areas.map((a) => (
              <div key={a.area} className="flex flex-col gap-1">
                <div className="flex justify-between text-[14px]"><span>{a.area}</span><span className="font-semibold">{a.n}</span></div>
                <div className="h-2.5 rounded-full bg-chip"><div className="h-2.5 rounded-full bg-ink" style={{ width: `${(a.n / maxA) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="px-5 py-4"><h2 className="h2">Team utilisation</h2><p className="text-[13px] text-muted">Billable hours against each person's weekly target</p></div>
          {r.team.map((t) => (
            <div key={t.id} className="flex items-center gap-3.5 border-t border-[#eef0f3] px-5 py-3">
              <Avatar name={t.name} color={t.color} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between text-[14px]"><span className="font-semibold">{t.name}</span><span className={cn("font-semibold", t.pct < 85 ? "text-bad" : "text-good")}>{t.pct}%</span></div>
                <div className="mt-1 h-2 rounded-full bg-chip"><div className={cn("h-2 rounded-full", t.pct < 85 ? "bg-bad-line" : "bg-good")} style={{ width: `${Math.min(100, t.pct)}%` }} /></div>
                <div className="mt-1 text-[12px] text-muted">{Math.round(t.hours)} of {t.targetHours} h · {t.title}</div>
              </div>
            </div>
          ))}
        </section>
        <section className="card p-5">
          <h2 className="h2">LawAI usage</h2>
          <p className="text-[13px] text-muted">Logged automatically from every AI action in this period</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[["Assistant answers", r.ai.chat], ["Documents reviewed", r.ai.review], ["Drafts generated", r.ai.draft], ["Research questions", r.ai.research]].map(([l, v]) => (
              <div key={String(l)} className="rounded-xl border border-line p-4"><div className="font-display text-[26px] font-bold">{v}</div><div className="text-[13px] text-muted">{l}</div></div>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-good-soft p-4 text-good">
            <div className="font-display text-[26px] font-bold">≈ {r.ai.savedHours} hours saved</div>
            <div className="text-[13px]">Estimate using per-action minutes set in <Link href="/settings" className="underline">Settings</Link> · {r.ai.tokens.toLocaleString()} tokens used</div>
          </div>
        </section>
      </div>
    </>
  );
}
