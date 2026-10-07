"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, BookOpenText, Briefcase, Building2, CalendarCheck, CalendarClock, FileText, LayoutGrid, PenLine, Sparkles, Users, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canOpen, type Role } from "@/lib/permissions";

const GROUPS = [
  { label: "Workspace", items: [
    { label: "Dashboard", href: "/", icon: LayoutGrid },
    { label: "AI Assistant", href: "/assistant", icon: Sparkles },
  ] },
  { label: "Practice", items: [
    { label: "Cases", href: "/cases", icon: Briefcase, badge: "cases" },
    { label: "Clients", href: "/clients", icon: Users },
    { label: "Tasks & deadlines", href: "/tasks", icon: CalendarCheck, badge: "urgent" },
  ] },
  { label: "Documents", items: [
    { label: "Documents", href: "/documents", icon: FileText },
    { label: "Drafting & review", href: "/drafting", icon: PenLine },
  ] },
  { label: "Insights", items: [
    { label: "Legal research", href: "/research", icon: BookOpenText },
    { label: "Reports", href: "/reports", icon: BarChart3 },
  ] },
] as const;

/** LawAI operators run the platform rather than a practice, so they get the operator console instead. */
const OPERATOR_GROUPS = [
  { label: "Platform", items: [
    { label: "Overview", href: "/platform", icon: LayoutGrid },
    { label: "Firms", href: "/platform/firms", icon: Building2 },
    { label: "Renewals", href: "/platform/renewals", icon: CalendarClock, badge: "renewals" },
  ] },
] as const;

export function Nav({ badges, role, platform, onNavigate }: { badges: Record<string, number>; role: Role; platform?: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const groups: readonly { label: string; items: readonly { label: string; href: string; icon: typeof LayoutGrid; badge?: string }[] }[] = platform ? OPERATOR_GROUPS : GROUPS;
  const active = (href: string) => (href === "/" || href === "/platform" ? path === href : path.startsWith(href));
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-5">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-[#8592a8]">{g.label}</div>
          {g.items.filter((it) => canOpen({ role }, it.href)).map((it) => {
            const on = active(it.href);
            const Icon = it.icon;
            const badge = it.badge ? badges[it.badge] : 0;
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={onNavigate}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-[42px] items-center gap-3 rounded-[9px] px-2.5 text-[14.5px] font-medium transition-colors",
                  on ? "bg-ink-3 text-white" : "text-ink-text hover:bg-ink-2 hover:text-white",
                )}
              >
                <Icon size={18} strokeWidth={1.8} aria-hidden />
                <span className="flex-1">{it.label}</span>
                {!!badge && <span className="rounded-full bg-[#24314d] px-2 py-0.5 text-[12px] font-semibold text-[#dce3ef]">{badge}</span>}
              </Link>
            );
          })}
        </div>
      ))}
      <Link
        href="/settings"
        onClick={onNavigate}
        className={cn("mt-auto flex min-h-[42px] items-center gap-3 rounded-[9px] px-2.5 text-[14.5px] font-medium", path.startsWith("/settings") ? "bg-ink-3 text-white" : "text-ink-text hover:bg-ink-2")}
      >
        <Settings size={18} strokeWidth={1.8} aria-hidden /> Settings
      </Link>
    </nav>
  );
}

export function MobileNav({ badges, role, platform }: { badges: Record<string, number>; role: Role; platform?: boolean }) {
  return (
    <details className="group lg:hidden">
      <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-[10px] border border-line-strong bg-white" aria-label="Open menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </summary>
      <div className="fixed inset-0 z-40 flex">
        <div className="flex w-[272px] flex-col gap-6 overflow-y-auto bg-ink p-4">
          <Nav badges={badges} role={role} platform={platform} onNavigate={() => document.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"))} />
        </div>
        <button
          type="button"
          aria-label="Close menu"
          className="flex-1 bg-black/40"
          onClick={(e) => (e.currentTarget.closest("details") as HTMLDetailsElement).removeAttribute("open")}
        />
      </div>
    </details>
  );
}
