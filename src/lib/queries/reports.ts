import "server-only";
import { and, count, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { differenceInCalendarWeeks, startOfQuarter, startOfWeek, subQuarters, addWeeks, format } from "date-fns";
import { db } from "@/db";
import { aiUsage, cases, firms, timeEntries, users } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";

export type Period = "quarter" | "last_quarter" | "ytd";

function range(p: Period) {
  const now = new Date();
  if (p === "last_quarter") {
    const s = startOfQuarter(subQuarters(now, 1));
    return { from: s, to: startOfQuarter(now), prevFrom: startOfQuarter(subQuarters(now, 2)) };
  }
  if (p === "ytd") {
    const s = new Date(now.getFullYear(), 0, 1);
    return { from: s, to: now, prevFrom: new Date(now.getFullYear() - 1, 0, 1) };
  }
  const s = startOfQuarter(now);
  return { from: s, to: now, prevFrom: startOfQuarter(subQuarters(now, 1)) };
}
const d = (x: Date) => x.toISOString().slice(0, 10);

export async function getReports(user: SessionUser, period: Period) {
  const { from, to, prevFrom } = range(period);
  const prevTo = from;
  const hours = (a: Date, b: Date, billable?: boolean) =>
    db
      .select({ h: sql<number>`coalesce(sum(${timeEntries.hours}), 0)`.mapWith(Number) })
      .from(timeEntries)
      .where(and(eq(timeEntries.firmId, user.firmId), gte(timeEntries.workDate, d(a)), lt(timeEntries.workDate, d(b)), billable === undefined ? undefined : eq(timeEntries.billable, billable)));

  const closeDays = (a: Date, b: Date) =>
    db
      .select({ v: sql<number | null>`avg(${cases.closedAt} - ${cases.openedAt})`.mapWith((x) => (x == null ? null : Number(x))) })
      .from(cases)
      .where(and(eq(cases.firmId, user.firmId), gte(cases.closedAt, d(a)), lt(cases.closedAt, d(b))));

  const opened = (a: Date, b: Date) =>
    db.select({ n: count() }).from(cases).where(and(eq(cases.firmId, user.firmId), gte(cases.openedAt, d(a)), lt(cases.openedAt, d(b))));

  const [[billNow], [billPrev], [allNow], [allPrev], [closeNow], [closePrev], [openNow], [openPrev]] = await Promise.all([
    hours(from, to, true),
    hours(prevFrom, prevTo, true),
    hours(from, to),
    hours(prevFrom, prevTo),
    closeDays(from, to),
    closeDays(prevFrom, prevTo),
    opened(from, to),
    opened(prevFrom, prevTo),
  ]);
  const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : 0);
  const util = allNow!.h ? Math.round((billNow!.h / allNow!.h) * 100) : 0;
  const utilPrev = allPrev!.h ? Math.round((billPrev!.h / allPrev!.h) * 100) : 0;

  // Weekly billable hours, last 13 weeks.
  const wkStart = startOfWeek(addWeeks(new Date(), -12), { weekStartsOn: 1 });
  const weeklyRows = await db
    .select({
      wk: sql<string>`to_char(date_trunc('week', ${timeEntries.workDate}::timestamp), 'YYYY-MM-DD')`,
      h: sql<number>`sum(${timeEntries.hours})`.mapWith(Number),
    })
    .from(timeEntries)
    .where(and(eq(timeEntries.firmId, user.firmId), eq(timeEntries.billable, true), gte(timeEntries.workDate, d(wkStart))))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  const weekly = Array.from({ length: 13 }, (_, i) => {
    const w = addWeeks(wkStart, i);
    const key = format(w, "yyyy-MM-dd");
    return { label: format(w, "d MMM"), hours: Math.round(weeklyRows.find((r) => r.wk === key)?.h ?? 0) };
  });

  const [areas, team, ai, [firm]] = await Promise.all([
    db
      .select({ area: cases.practiceArea, n: count() })
      .from(cases)
      .where(and(eq(cases.firmId, user.firmId), ne(cases.status, "closed")))
      .groupBy(cases.practiceArea)
      .orderBy(desc(count())),
    db
      .select({
        id: users.id,
        name: users.name,
        title: users.title,
        color: users.color,
        target: users.weeklyTargetHours,
        hours: sql<number>`coalesce(sum(${timeEntries.hours}) filter (where ${timeEntries.billable}), 0)`.mapWith(Number),
      })
      .from(users)
      .leftJoin(timeEntries, and(eq(timeEntries.userId, users.id), gte(timeEntries.workDate, d(from)), lt(timeEntries.workDate, d(to))))
      .where(eq(users.firmId, user.firmId))
      .groupBy(users.id)
      .orderBy(desc(sql`5`)),
    db
      .select({ feature: aiUsage.feature, n: count(), tokens: sql<number>`sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens})`.mapWith(Number) })
      .from(aiUsage)
      .where(and(eq(aiUsage.firmId, user.firmId), gte(aiUsage.createdAt, from), lt(aiUsage.createdAt, to)))
      .groupBy(aiUsage.feature),
    db.select({ m: firms.aiMinutesSaved }).from(firms).where(eq(firms.id, user.firmId)),
  ]);
  const weeks = Math.max(1, differenceInCalendarWeeks(to, from, { weekStartsOn: 1 }) + 1);
  const minutes = firm?.m ?? {};
  const aiCount = (f: string) => ai.find((a) => a.feature === f)?.n ?? 0;
  const savedHours = Math.round(["chat", "review", "draft", "research"].reduce((s, f) => s + aiCount(f) * (minutes[f] ?? 0), 0) / 60);

  return {
    period: { from, to },
    kpis: [
      { label: "Billable hours", value: `${Math.round(billNow!.h).toLocaleString()} h`, delta: `${pct(billNow!.h, billPrev!.h) >= 0 ? "↑" : "↓"} ${Math.abs(pct(billNow!.h, billPrev!.h))}%`, good: billNow!.h >= billPrev!.h },
      { label: "Billable share of time", value: `${util}%`, delta: `${util >= utilPrev ? "↑" : "↓"} ${Math.abs(util - utilPrev)} pts`, good: util >= utilPrev },
      { label: "Matters opened", value: String(openNow!.n), delta: `${openNow!.n >= openPrev!.n ? "↑" : "↓"} ${Math.abs(openNow!.n - openPrev!.n)}`, good: null },
      {
        label: "Avg. days to close",
        value: closeNow!.v == null ? "—" : String(Math.round(closeNow!.v)),
        delta: closeNow!.v == null || closePrev!.v == null ? "no prior data" : `${closeNow!.v <= closePrev!.v ? "↓" : "↑"} ${Math.abs(Math.round(closeNow!.v - closePrev!.v))} days`,
        good: closeNow!.v == null || closePrev!.v == null ? null : closeNow!.v <= closePrev!.v,
      },
    ],
    weekly,
    areas,
    team: team.map((t) => {
      const target = t.target * weeks;
      return { ...t, targetHours: target, pct: target ? Math.round((t.hours / target) * 100) : 0 };
    }),
    ai: {
      chat: aiCount("chat"),
      review: aiCount("review"),
      draft: aiCount("draft"),
      research: aiCount("research"),
      savedHours,
      tokens: ai.reduce((s, a) => s + a.tokens, 0),
    },
  };
}
