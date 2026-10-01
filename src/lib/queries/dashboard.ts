import "server-only";
import { and, asc, count, desc, eq, gte, inArray, lt, lte, ne, or, sql } from "drizzle-orm";
import { addDays, subDays } from "date-fns";
import { db } from "@/db";
import { cases, clients, documentIssues, documents, events, tasks } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { accessibleCaseIds, caseIn, caseScope } from "@/lib/access";

export type Tone = "good" | "bad" | "neutral";
export type Kpi = { label: string; value: number; delta: number; note: string; tone: Tone; icon: string; href: string };

/** Delta colouring is semantic: for some metrics "up" is bad (urgent tasks), for others good. */
const tone = (delta: number, upIsGood: boolean | null): Tone =>
  delta === 0 || upIsGood === null ? "neutral" : (delta > 0) === upIsGood ? "good" : "bad";

export async function getDashboard(user: SessionUser) {
  const ids = await accessibleCaseIds(user);
  const now = new Date();
  const in14 = addDays(now, 14);
  const ago14 = subDays(now, 14);
  const ago30 = subDays(now, 30);
  const myCases = caseIn(cases.id, ids);

  const [
    [active],
    [opened30],
    [closed30],
    [deadlinesNext],
    [deadlinesPrev],
    [activeClients],
    [newClients],
    [urgent],
    [urgentNewWeek],
  ] = await Promise.all([
    db.select({ n: count() }).from(cases).where(and(myCases, eq(cases.status, "active"))),
    db.select({ n: count() }).from(cases).where(and(myCases, gte(cases.openedAt, ago30.toISOString().slice(0, 10)))),
    db.select({ n: count() }).from(cases).where(and(myCases, gte(cases.closedAt, ago30.toISOString().slice(0, 10)))),
    db.select({ n: count() }).from(events).where(and(eq(events.firmId, user.firmId), caseScope(events.caseId, ids), inArray(events.type, ["deadline", "hearing"]), gte(events.startsAt, now), lte(events.startsAt, in14))),
    db.select({ n: count() }).from(events).where(and(eq(events.firmId, user.firmId), caseScope(events.caseId, ids), inArray(events.type, ["deadline", "hearing"]), gte(events.startsAt, ago14), lt(events.startsAt, now))),
    db.select({ n: sql<number>`count(distinct ${cases.clientId})`.mapWith(Number) }).from(cases).where(and(myCases, eq(cases.status, "active"))),
    db.select({ n: count() }).from(clients).where(and(eq(clients.firmId, user.firmId), gte(clients.createdAt, ago30))),
    db.select({ n: count() }).from(tasks).where(and(eq(tasks.firmId, user.firmId), caseScope(tasks.caseId, ids), eq(tasks.status, "open"), or(eq(tasks.priority, "high"), lte(tasks.dueAt, addDays(now, 3))))),
    db.select({ n: count() }).from(tasks).where(and(eq(tasks.firmId, user.firmId), caseScope(tasks.caseId, ids), eq(tasks.status, "open"), gte(tasks.createdAt, subDays(now, 7)), or(eq(tasks.priority, "high"), lte(tasks.dueAt, addDays(now, 3))))),
  ]);

  const caseDelta = opened30!.n - closed30!.n;
  const dlDelta = deadlinesNext!.n - deadlinesPrev!.n;
  const kpis: Kpi[] = [
    { label: "Active cases", value: active!.n, delta: caseDelta, note: "net, last 30 days", tone: tone(caseDelta, null), icon: "briefcase", href: "/cases" },
    { label: "Deadlines & hearings, next 14 days", value: deadlinesNext!.n, delta: dlDelta, note: "vs. previous 14 days", tone: tone(dlDelta, false), icon: "clock", href: "/tasks" },
    { label: "Active clients", value: activeClients!.n, delta: newClients!.n, note: "new in last 30 days", tone: tone(newClients!.n, true), icon: "users", href: "/clients" },
    { label: "Urgent tasks", value: urgent!.n, delta: urgentNewWeek!.n, note: "added this week", tone: tone(urgentNewWeek!.n, false), icon: "alert", href: "/tasks" },
  ];

  const nextEventSq = db
    .select({ caseId: events.caseId, startsAt: sql<Date>`min(${events.startsAt})`.as("next_at") })
    .from(events)
    .where(gte(events.startsAt, now))
    .groupBy(events.caseId)
    .as("nx");

  const [recentCases, upcomingEvents, dueTasks, issueDocs, [overdue], recentDocs, [failed]] = await Promise.all([
    db
      .select({ c: cases, nextAt: nextEventSq.startsAt })
      .from(cases)
      .leftJoin(nextEventSq, eq(nextEventSq.caseId, cases.id))
      .where(and(myCases, ne(cases.status, "closed")))
      .orderBy(sql`${nextEventSq.startsAt} asc nulls last`)
      .limit(6),
    db
      .select({ e: events, caseTitle: cases.title })
      .from(events)
      .leftJoin(cases, eq(cases.id, events.caseId))
      .where(and(eq(events.firmId, user.firmId), caseScope(events.caseId, ids), gte(events.startsAt, now), lte(events.startsAt, in14)))
      .orderBy(asc(events.startsAt))
      .limit(6),
    db
      .select({ t: tasks, caseTitle: cases.title })
      .from(tasks)
      .leftJoin(cases, eq(cases.id, tasks.caseId))
      .where(and(eq(tasks.firmId, user.firmId), caseScope(tasks.caseId, ids), eq(tasks.status, "open"), lte(tasks.dueAt, in14)))
      .orderBy(asc(tasks.dueAt))
      .limit(6),
    db
      .select({ docId: documents.id, title: documents.title, n: count(), high: sql<number>`count(*) filter (where ${documentIssues.severity} = 'high')`.mapWith(Number) })
      .from(documentIssues)
      .innerJoin(documents, eq(documents.id, documentIssues.documentId))
      .where(and(eq(documentIssues.firmId, user.firmId), eq(documentIssues.status, "open"), caseScope(documents.caseId, ids)))
      .groupBy(documents.id, documents.title)
      .orderBy(desc(sql`count(*)`))
      .limit(3),
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(eq(tasks.firmId, user.firmId), caseScope(tasks.caseId, ids), eq(tasks.status, "open"), lt(tasks.dueAt, now))),
    db
      .select({ d: documents, caseTitle: cases.title })
      .from(documents)
      .leftJoin(cases, eq(cases.id, documents.caseId))
      .where(and(eq(documents.firmId, user.firmId), caseScope(documents.caseId, ids)))
      .orderBy(desc(documents.updatedAt))
      .limit(5),
    db.select({ n: count() }).from(documents).where(and(eq(documents.firmId, user.firmId), eq(documents.ingestStatus, "failed"))),
  ]);

  // Merge events + tasks into one agenda, soonest first.
  const agenda = [
    ...upcomingEvents.map(({ e, caseTitle }) => ({ id: e.id, kind: e.type, title: e.title, matter: caseTitle, at: e.startsAt, href: e.caseId ? `/cases/${e.caseId}` : "/tasks", allDay: e.allDay })),
    ...dueTasks.map(({ t, caseTitle }) => ({ id: t.id, kind: "task" as const, title: t.title, matter: caseTitle, at: t.dueAt!, href: "/tasks", allDay: false })),
  ]
    .sort((a, b) => +new Date(a.at) - +new Date(b.at))
    .slice(0, 7);

  // Insights are computed from data (cheap, instant, always fresh) rather than generated.
  const insights: { tag: string; tone: Tone; text: string; action: string; href: string }[] = [];
  for (const d of issueDocs) {
    insights.push({
      tag: "Risk",
      tone: d.high ? "bad" : "neutral",
      text: `${d.n} open review finding${d.n === 1 ? "" : "s"} in ${d.title}${d.high ? `, ${d.high} high risk` : ""}.`,
      action: "Review findings",
      href: `/documents/${d.docId}`,
    });
  }
  if (overdue!.n) insights.push({ tag: "Overdue", tone: "bad", text: `${overdue!.n} task${overdue!.n === 1 ? " is" : "s are"} past due.`, action: "Open tasks", href: "/tasks" });
  const nextHearing = upcomingEvents.find(({ e }) => e.type === "hearing");
  if (nextHearing) {
    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(tasks)
      .where(and(eq(tasks.caseId, nextHearing.e.caseId!), eq(tasks.status, "open"), lte(tasks.dueAt, nextHearing.e.startsAt)));
    if (n) insights.push({ tag: "Hearing", tone: "neutral", text: `${n} open task${n === 1 ? "" : "s"} due before the hearing in ${nextHearing.caseTitle}.`, action: "Open matter", href: `/cases/${nextHearing.e.caseId}` });
  }
  if (failed!.n) insights.push({ tag: "Documents", tone: "bad", text: `${failed!.n} upload${failed!.n === 1 ? "" : "s"} couldn't be processed.`, action: "Fix uploads", href: "/documents?ingest=failed" });

  return { kpis, recentCases, agenda, insights: insights.slice(0, 4), recentDocs };
}
