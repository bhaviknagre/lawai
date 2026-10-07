import "server-only";
import { and, asc, eq, gte, ne, sql } from "drizzle-orm";
import { format, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from "date-fns";
import { cache } from "react";
import { db } from "@/db";
import { activities, aiUsage, cases, clients, documents, firms, sessions, users } from "@/db/schema";
import { listFirms } from "./onboarding";
import { isPaying, OPS_SLUG, renewal, RENEWAL_WINDOW_DAYS } from "./subscriptions";

/**
 * Business analytics for the /platform operator console. Everything is per customer firm; the
 * internal LawAI Operations firm is left out. Practice data is only ever counted, never read.
 */

const byFirm = <T extends { firmId: string }>(rows: T[]) => new Map(rows.map((r) => [r.firmId, r]));
const n = (col: unknown) => sql<number>`count(${col})`.mapWith(Number);

/** Every customer firm with its plan, renewal status, team make-up and usage. */
export const getFirmStats = cache(async () => {
  const since30 = subDays(new Date(), 30);
  const [list, team, clientN, caseN, docN, ai, lastSession, lastActivity] = await Promise.all([
    listFirms(),
    db
      .select({
        firmId: users.firmId,
        admins: sql<number>`count(*) filter (where ${users.role} = 'admin' and ${users.deactivatedAt} is null)`.mapWith(Number),
        associates: sql<number>`count(*) filter (where ${users.role} = 'attorney' and ${users.deactivatedAt} is null)`.mapWith(Number),
        paralegals: sql<number>`count(*) filter (where ${users.role} = 'paralegal' and ${users.deactivatedAt} is null)`.mapWith(Number),
        seatsUsed: sql<number>`count(*) filter (where ${users.deactivatedAt} is null)`.mapWith(Number),
      })
      .from(users)
      .groupBy(users.firmId),
    db.select({ firmId: clients.firmId, n: n(clients.id) }).from(clients).groupBy(clients.firmId),
    db
      .select({ firmId: cases.firmId, open: sql<number>`count(*) filter (where ${cases.status} <> 'closed')`.mapWith(Number), total: n(cases.id) })
      .from(cases)
      .groupBy(cases.firmId),
    db.select({ firmId: documents.firmId, n: n(documents.id) }).from(documents).groupBy(documents.firmId),
    db
      .select({ firmId: aiUsage.firmId, n: n(aiUsage.id), tokens: sql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}), 0)`.mapWith(Number) })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, since30))
      .groupBy(aiUsage.firmId),
    db.select({ firmId: users.firmId, at: sql<Date | null>`max(${sessions.createdAt})`.mapWith((v) => (v ? new Date(v) : null)) }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).groupBy(users.firmId),
    db.select({ firmId: activities.firmId, at: sql<Date | null>`max(${activities.createdAt})`.mapWith((v) => (v ? new Date(v) : null)) }).from(activities).groupBy(activities.firmId),
  ]);
  const [T, C, K, D, A, S, L] = [byFirm(team), byFirm(clientN), byFirm(caseN), byFirm(docN), byFirm(ai), byFirm(lastSession), byFirm(lastActivity)];
  return list
    .filter((f) => f.slug !== OPS_SLUG)
    .map((f) => {
      const t = T.get(f.id);
      const seen = [S.get(f.id)?.at, L.get(f.id)?.at].filter((d): d is Date => !!d);
      return {
        ...f,
        renewal: renewal(f),
        paying: isPaying(f),
        team: { admins: t?.admins ?? 0, associates: t?.associates ?? 0, paralegals: t?.paralegals ?? 0 },
        seatsUsed: t?.seatsUsed ?? 0,
        clients: C.get(f.id)?.n ?? 0,
        openCases: K.get(f.id)?.open ?? 0,
        totalCases: K.get(f.id)?.total ?? 0,
        documents: D.get(f.id)?.n ?? 0,
        aiActions30d: A.get(f.id)?.n ?? 0,
        aiTokens30d: A.get(f.id)?.tokens ?? 0,
        lastActiveAt: seen.length ? new Date(Math.max(...seen.map((d) => d.getTime()))) : null,
      };
    });
});
export type FirmStats = Awaited<ReturnType<typeof getFirmStats>>[number];

/** Filters for the Firms report and its CSV export. */
export const FIRM_FILTERS: { id: string; label: string; match: (f: FirmStats) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "paying", label: "Paying", match: (f) => f.paying },
  { id: "trial", label: "Trial", match: (f) => f.plan === "trial" && !f.suspendedAt },
  { id: "due", label: "Ending soon", match: (f) => f.renewal.state === "due" },
  { id: "expired", label: "Expired", match: (f) => f.renewal.state === "expired" },
  { id: "suspended", label: "Suspended", match: (f) => !!f.suspendedAt },
];

/** Headline numbers, growth and the renewal queue for the operator overview. */
export async function getPlatformOverview() {
  const firmsList = await getFirmStats();
  const now = new Date();
  const weeksFrom = startOfWeek(subWeeks(now, 11), { weekStartsOn: 1 });
  const aiWeekly = await db
    .select({ week: sql<string>`to_char(date_trunc('week', ${aiUsage.createdAt}), 'YYYY-MM-DD')`, n: n(aiUsage.id) })
    .from(aiUsage)
    .innerJoin(firms, eq(firms.id, aiUsage.firmId))
    .where(and(gte(aiUsage.createdAt, weeksFrom), ne(firms.slug, OPS_SLUG)))
    .groupBy(sql`1`)
    .orderBy(asc(sql`1`));

  const live = firmsList.filter((f) => !f.suspendedAt);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const mrr = sum(firmsList.filter((f) => f.paying).map((f) => f.monthlyFee));
  const people = {
    admins: sum(live.map((f) => f.team.admins)),
    associates: sum(live.map((f) => f.team.associates)),
    paralegals: sum(live.map((f) => f.team.paralegals)),
  };
  const newThisMonth = firmsList.filter((f) => f.createdAt >= startOfMonth(now)).length;

  const months = Array.from({ length: 12 }, (_, i) => startOfMonth(subMonths(now, 11 - i)));
  const signups = months.map((m, i) => ({
    label: format(m, "MMM"),
    n: firmsList.filter((f) => f.createdAt >= m && (i === 11 || f.createdAt < months[i + 1]!)).length,
  }));
  const weeks = Array.from({ length: 12 }, (_, i) => startOfWeek(subWeeks(now, 11 - i), { weekStartsOn: 1 }));
  const aiByWeek = new Map(aiWeekly.map((w) => [w.week, w.n]));
  const usage = weeks.map((w) => ({ label: format(w, "d MMM"), n: aiByWeek.get(format(w, "yyyy-MM-dd")) ?? 0 }));

  const plans = Object.entries(Object.groupBy(live, (f) => f.plan)).map(([plan, xs]) => ({ plan, n: xs!.length, mrr: sum(xs!.filter((f) => f.paying).map((f) => f.monthlyFee)) }));

  return {
    firms: firmsList,
    kpis: {
      total: firmsList.length,
      active: live.length,
      suspended: firmsList.length - live.length,
      trials: live.filter((f) => f.plan === "trial").length,
      paying: firmsList.filter((f) => f.paying).length,
      newThisMonth,
      mrr,
      seatsUsed: sum(live.map((f) => f.seatsUsed)),
      seatsSold: sum(live.map((f) => f.seatLimit ?? 0)),
      people,
      aiActions30d: sum(firmsList.map((f) => f.aiActions30d)),
      dormant: live.filter((f) => !f.lastActiveAt || f.lastActiveAt < subDays(now, 14)).length,
    },
    renewals: renewalQueue(firmsList),
    signups,
    usage,
    plans,
    topUsage: [...live].sort((a, b) => b.aiActions30d - a.aiActions30d).slice(0, 6),
  };
}

/** Expired and soon-ending terms, most urgent first. Suspended firms are left out (already handled). */
export function renewalQueue(list: FirmStats[], windowDays = RENEWAL_WINDOW_DAYS) {
  return list
    .filter((f) => (f.renewal.state === "expired" || f.renewal.state === "due" || f.renewal.state === "ok") && f.renewal.days! <= windowDays)
    .sort((a, b) => a.renewal.days! - b.renewal.days!);
}

/** One firm's people (never their practice data) for the firm detail page. */
export async function getFirmPeople(firmId: string) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, title: users.title, color: users.color, activatedAt: users.activatedAt, deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(eq(users.firmId, firmId))
    .orderBy(asc(users.deactivatedAt), asc(users.role), asc(users.name));
}
