import Link from "next/link";
import { format } from "date-fns";
import { renewFirm } from "@/app/actions/platform";
import { ConfirmButton } from "@/components/forms";
import { Field, Pill } from "@/components/ui";
import { PLANS, type Plan, type Renewal } from "@/lib/subscriptions";
import { cn } from "@/lib/utils";

/** Pieces shared by the /platform operator pages. */

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "bad" | "good" }) {
  return (
    <div className="card flex flex-col gap-2 p-5">
      <span className="text-[13.5px] font-medium text-muted">{label}</span>
      <span className={cn("font-display text-[30px] font-bold leading-none", tone === "bad" && "text-bad", tone === "good" && "text-good")}>{value}</span>
      {sub && <span className="text-[12.5px] text-subtle">{sub}</span>}
    </div>
  );
}

export function Bars({ data, label }: { data: { label: string; n: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div className="mt-5 flex h-48 items-end gap-1.5" role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${d.n}`).join(", ")}`}>
      {data.map((d, i) => (
        <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted">{d.n || ""}</span>
          <div className={cn("w-full rounded-t-md", i === data.length - 1 ? "bg-accent" : "bg-[#c9d0f5]")} style={{ height: `${Math.max(2, (d.n / max) * 150)}px` }} />
          <span className="truncate text-[10.5px] text-subtle">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export const PlanPill = ({ plan }: { plan: Plan }) => <Pill tone={plan === "trial" ? "mid" : plan === "enterprise" ? "hearing" : "neutral"}>{PLANS[plan].label}</Pill>;

export const RenewalPill = ({ r }: { r: Renewal }) => <Pill tone={r.tone}>{r.label}</Pill>;

export function Seats({ used, limit }: { used: number; limit: number | null }) {
  const full = limit !== null && used >= limit;
  return (
    <span className={cn("whitespace-nowrap", full && "font-semibold text-bad")}>
      {used} / {limit ?? "∞"}
    </span>
  );
}

export function RenewButtons({ firmId, name }: { firmId: string; name: string }) {
  return (
    <div className="flex gap-1.5">
      <ConfirmButton onConfirm={renewFirm.bind(null, firmId, 1)} message={`Extend ${name} by 1 month?`} className="btn btn-secondary btn-sm">+1 month</ConfirmButton>
      <ConfirmButton onConfirm={renewFirm.bind(null, firmId, 12)} message={`Extend ${name} by 1 year?`} className="btn btn-secondary btn-sm">+1 year</ConfirmButton>
    </div>
  );
}

/** Plan inputs used when onboarding a firm and when editing its subscription. */
export function SubscriptionFields({ plan = "trial", seatLimit, monthlyFee = 0, endsAt }: { plan?: Plan; seatLimit?: number | null; monthlyFee?: number; endsAt?: Date | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Plan">
        <select className="input" name="plan" defaultValue={plan}>
          {Object.entries(PLANS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
        </select>
      </Field>
      <Field label="Seats" hint="Active and invited people. Blank = unlimited.">
        <input className="input" name="seatLimit" type="number" min={1} defaultValue={seatLimit ?? ""} />
      </Field>
      <Field label="Monthly fee">
        <input className="input" name="monthlyFee" type="number" min={0} step={1} defaultValue={monthlyFee} />
      </Field>
      <Field label="Ends on" hint="Trial or paid term. Blank = no end date.">
        <input className="input" name="endsAt" type="date" defaultValue={endsAt ? format(endsAt, "yyyy-MM-dd") : ""} />
      </Field>
    </div>
  );
}

export function Tabs({ items, current }: { items: { id: string; label: string; href: string; n?: number }[]; current: string }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-[10px] bg-chip p-1">
      {items.map((t) => (
        <Link key={t.id} href={t.href} aria-current={current === t.id ? "page" : undefined} className={cn("flex h-9 items-center gap-1.5 rounded-[7px] px-3 text-[13.5px] font-semibold", current === t.id ? "bg-white shadow-sm" : "text-muted")}>
          {t.label}
          {t.n !== undefined && <span className="text-[12px] text-subtle">{t.n}</span>}
        </Link>
      ))}
    </div>
  );
}
