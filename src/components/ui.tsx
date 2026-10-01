import Link from "next/link";
import { cn } from "@/lib/utils";

type Tone = "good" | "bad" | "neutral" | "mid" | "hearing" | "low";
const TONES: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  bad: "bg-bad-soft text-bad",
  neutral: "bg-chip text-chip-text",
  mid: "bg-mid-soft text-mid",
  hearing: "bg-hearing-soft text-hearing",
  low: "bg-chip text-[#475467]",
};

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("pill", TONES[tone], className)}>{children}</span>;
}

export const priorityTone = (p: string): Tone => (p === "high" ? "bad" : p === "medium" ? "mid" : "low");
export const docStatusTone = (s: string): Tone =>
  s === "in_review" ? "mid" : s === "signed" || s === "filed" ? "good" : s === "final" ? "low" : "neutral";
export const eventTone = (t: string): Tone =>
  t === "hearing" ? "hearing" : t === "deadline" ? "bad" : t === "meeting" ? "good" : "neutral";

export function Avatar({ name, color, size = 32, className }: { name: string; color?: string; size?: number; className?: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <span
      title={name}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white", className)}
      style={{ width: size, height: size, background: color ?? "#2A3858", fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="h1">{title}</h1>
        {sub && <p className="text-[14px] text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}

export function CardHeader({ title, href, linkLabel, children }: { title: string; href?: string; linkLabel?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <h2 className="h2">{title}</h2>
      {children}
      {href && (
        <Link href={href} className="link text-[14px]">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <p className="max-w-md text-[13.5px] text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function DocIcon({ ext }: { ext: string }) {
  return (
    <span className="flex h-10 w-[34px] shrink-0 items-end justify-center rounded-md border border-line-strong bg-sunken pb-1 font-mono text-[9.5px] font-medium text-chip-text">
      {ext}
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="label">
      {label}
      {children}
      {hint && <span className="text-[12px] font-normal text-muted">{hint}</span>}
    </label>
  );
}
