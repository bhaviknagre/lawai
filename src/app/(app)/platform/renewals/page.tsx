import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { getFirmStats, renewalQueue, type FirmStats } from "@/lib/platform-stats";
import { money, PLANS } from "@/lib/subscriptions";
import { RenewButtons, RenewalPill, Seats } from "@/components/platform";
import { PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Renewals" };

/** Every firm's term end date, most urgent first, with one-click renewals. */
export default async function RenewalsPage() {
  await requirePlatformAdmin();
  const firms = await getFirmStats();
  const queue = renewalQueue(firms, 90);
  const groups: { title: string; sub: string; rows: FirmStats[] }[] = [
    { title: "Expired", sub: "Term has ended. Renew, or stop service from the firm's page.", rows: queue.filter((f) => f.renewal.days! < 0) },
    { title: "Ending in 7 days", sub: "Contact these firms now.", rows: queue.filter((f) => f.renewal.days! >= 0 && f.renewal.days! <= 7) },
    { title: "Ending in 8–30 days", sub: "Send renewal invoices.", rows: queue.filter((f) => f.renewal.days! > 7 && f.renewal.days! <= 30) },
    { title: "Ending in 31–90 days", sub: "Coming up.", rows: queue.filter((f) => f.renewal.days! > 30) },
    { title: "No end date", sub: "Set a term so you get reminders.", rows: firms.filter((f) => f.renewal.state === "none") },
  ];

  return (
    <>
      <PageHeader title="Renewals" sub="When each firm's trial or paid term ends. Nothing is switched off automatically; you decide whether to renew or stop service." />
      {groups.map((g) => (
        <section key={g.title} className="card overflow-hidden">
          <div className="px-5 py-4">
            <h2 className="h2">{g.title} <span className="text-[14px] font-medium text-subtle">({g.rows.length})</span></h2>
            <p className="text-[13px] text-muted">{g.sub}</p>
          </div>
          {g.rows.length === 0 && <p className="border-t border-line px-5 py-3 text-[13.5px] text-muted">None.</p>}
          {g.rows.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 text-[14px]">
              <div className="min-w-[200px] flex-1">
                <Link href={`/platform/firms/${f.id}`} className="font-semibold hover:underline">{f.name}</Link>
                <div className="text-[12.5px] text-muted">
                  {PLANS[f.plan].label} · {f.monthlyFee ? `${money(f.monthlyFee)}/mo` : "no fee"} · seats <Seats used={f.seatsUsed} limit={f.seatLimit} /> · admin {f.admins.find((a) => !a.deactivatedAt)?.email ?? "none"}
                </div>
              </div>
              <span className="w-28 text-[13px] text-muted">{fmtDate(f.subscriptionEndsAt, "d MMM yyyy")}</span>
              <RenewalPill r={f.renewal} />
              <RenewButtons firmId={f.id} name={f.name} />
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
