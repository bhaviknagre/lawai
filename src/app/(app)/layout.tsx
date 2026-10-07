import Link from "next/link";
import { and, count, desc, eq, isNull, isNotNull, ne, or, lte } from "drizzle-orm";
import { addDays } from "date-fns";
import { AlertTriangle, Bell, Search, Sparkles, LogOut } from "lucide-react";
import { db } from "@/db";
import { cases, firms, notifications, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { accessibleCaseIds, caseIn, caseScope } from "@/lib/access";
import { Nav, MobileNav } from "@/components/nav";
import { Avatar } from "@/components/ui";
import { logout } from "@/app/actions/auth";
import { markNotificationsRead } from "@/app/actions/misc";
import { ADMIN_BANNER_DAYS, OPS_SLUG, RENEWAL_WINDOW_DAYS } from "@/lib/subscriptions";
import { ago, daysUntil, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const ids = await accessibleCaseIds(user);
  const [[{ n: caseCount } = { n: 0 }], [{ n: urgent } = { n: 0 }], notes, [{ n: renewals } = { n: 0 }]] = await Promise.all([
    db.select({ n: count() }).from(cases).where(and(caseIn(cases.id, ids), ne(cases.status, "closed"))),
    db.select({ n: count() }).from(tasks).where(and(eq(tasks.firmId, user.firmId), caseScope(tasks.caseId, ids), eq(tasks.status, "open"), or(eq(tasks.priority, "high"), lte(tasks.dueAt, addDays(new Date(), 3))))),
    db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(8),
    // Operators: firms whose term has ended or ends within the renewal window.
    user.isPlatformAdmin
      ? db.select({ n: count() }).from(firms).where(and(isNull(firms.suspendedAt), ne(firms.slug, OPS_SLUG), isNotNull(firms.subscriptionEndsAt), lte(firms.subscriptionEndsAt, addDays(new Date(), RENEWAL_WINDOW_DAYS))))
      : Promise.resolve([]),
  ]);
  const unread = notes.filter((n) => !n.readAt).length;
  const badges = { cases: caseCount, urgent, renewals };
  const termDays = user.role === "admin" && user.firmSubscriptionEndsAt ? daysUntil(user.firmSubscriptionEndsAt) : null;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto bg-ink px-3.5 py-5 lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-2 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v18M7 21h10M3 7h18M6 7l-3 7a3 3 0 006 0zM18 7l-3 7a3 3 0 006 0z" /></svg>
          </span>
          <span className="font-display text-[21px] font-extrabold tracking-[-0.01em]">LawAI</span>
        </Link>
        <Nav badges={badges} role={user.role} platform={user.isPlatformAdmin} />
        <div className="flex items-center gap-2.5 border-t border-ink-3 pl-2 pt-4">
          <Avatar name={user.name} color={user.color} size={38} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-white">{user.name}</div>
            <div className="truncate text-[12.5px] text-ink-muted">{user.title} · {user.firmName}</div>
          </div>
          <form action={logout}>
            <button className="flex h-11 w-11 items-center justify-center rounded-[9px] text-ink-muted hover:bg-ink-2 hover:text-white" aria-label="Sign out">
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white px-4 py-3 lg:px-8">
          <MobileNav badges={badges} role={user.role} platform={user.isPlatformAdmin} />
          {!user.isPlatformAdmin && (
            <form action="/search" role="search" className="relative flex max-w-[620px] flex-1 items-center">
              <label htmlFor="gsearch" className="sr-only">Search LawAI</label>
              <Search size={18} className="pointer-events-none absolute left-3.5 text-subtle" aria-hidden />
              <input id="gsearch" name="q" type="search" placeholder="Search cases, clients and documents" className="input h-11 bg-sunken pl-10" />
            </form>
          )}
          <div className="flex-1" />
          <details className="relative">
            <summary className="relative flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-[10px] border border-line-strong bg-white" aria-label={`Notifications, ${unread} unread`}>
              <Bell size={18} />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-bad text-[11px] font-bold text-white">{unread}</span>
              )}
            </summary>
            <div className="card absolute right-0 top-12 z-40 w-[340px] overflow-hidden shadow-lg">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="font-semibold">Notifications</span>
                {unread > 0 && (
                  <form action={markNotificationsRead}><button className="link text-[13px]">Mark all read</button></form>
                )}
              </div>
              {notes.length === 0 && <p className="px-4 pb-4 text-muted">You're all caught up.</p>}
              {notes.map((n) => (
                <Link key={n.id} href={n.href ?? "/"} className="flex gap-3 border-t border-line px-4 py-3 hover:bg-sunken">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`} />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold">{n.title}</span>
                    {n.body && <span className="block text-[13px] text-muted">{n.body}</span>}
                    <span className="block text-[12px] text-subtle">{ago(n.createdAt)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </details>
          {!user.isPlatformAdmin && (
            <Link href="/assistant" className="btn btn-primary hidden sm:inline-flex">
              <Sparkles size={17} /> Ask LawAI
            </Link>
          )}
        </header>
        {termDays !== null && termDays <= ADMIN_BANNER_DAYS && (
          <div role="status" className="flex items-center gap-2.5 border-b border-bad-line/30 bg-bad-soft px-4 py-2.5 text-[13.5px] font-medium text-bad lg:px-8">
            <AlertTriangle size={16} aria-hidden />
            {termDays < 0
              ? `Your firm's LawAI subscription ended on ${fmtDate(user.firmSubscriptionEndsAt, "d MMM yyyy")}. Contact LawAI to renew and keep access.`
              : `Your firm's LawAI subscription ${termDays === 0 ? "ends today" : `ends in ${termDays} day${termDays === 1 ? "" : "s"}`} (${fmtDate(user.firmSubscriptionEndsAt, "d MMM yyyy")}). Contact LawAI to renew.`}
          </div>
        )}
        <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 px-4 pb-12 pt-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
