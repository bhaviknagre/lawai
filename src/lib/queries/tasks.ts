import "server-only";
import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import { addDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { db } from "@/db";
import { cases, deadlineRules, events, tasks, users } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { accessibleCaseIds, caseScope } from "@/lib/access";

export async function getCalendar(user: SessionUser, month: Date, mine: boolean) {
  const ids = await accessibleCaseIds(user);
  const from = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const to = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const ev = await db
    .select({ e: events, caseTitle: cases.title })
    .from(events)
    .leftJoin(cases, eq(cases.id, events.caseId))
    .where(and(eq(events.firmId, user.firmId), caseScope(events.caseId, ids), gte(events.startsAt, from), lte(events.startsAt, to)))
    .orderBy(asc(events.startsAt));
  const tw: SQL[] = [eq(tasks.firmId, user.firmId), caseScope(tasks.caseId, ids), gte(tasks.dueAt, from), lte(tasks.dueAt, to)];
  if (mine) tw.push(eq(tasks.assigneeId, user.id));
  const due = await db
    .select({ t: tasks, caseTitle: cases.title })
    .from(tasks)
    .leftJoin(cases, eq(cases.id, tasks.caseId))
    .where(and(...tw))
    .orderBy(asc(tasks.dueAt));
  return { from, to, events: ev, tasks: due };
}

export async function getTaskList(user: SessionUser, mine: boolean) {
  const ids = await accessibleCaseIds(user);
  const w: SQL[] = [eq(tasks.firmId, user.firmId), caseScope(tasks.caseId, ids), eq(tasks.status, "open")];
  if (mine) w.push(eq(tasks.assigneeId, user.id));
  const rows = await db
    .select({ t: tasks, caseTitle: cases.title, assignee: users.name })
    .from(tasks)
    .leftJoin(cases, eq(cases.id, tasks.caseId))
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .where(and(...w))
    .orderBy(asc(tasks.dueAt))
    .limit(200);
  const now = new Date();
  const endToday = new Date(now);
  endToday.setHours(23, 59, 59, 999);
  const endWeek = addDays(endToday, 7);
  return {
    overdue: rows.filter((r) => r.t.dueAt && r.t.dueAt < now),
    today: rows.filter((r) => r.t.dueAt && r.t.dueAt >= now && r.t.dueAt <= endToday),
    week: rows.filter((r) => r.t.dueAt && r.t.dueAt > endToday && r.t.dueAt <= endWeek),
    later: rows.filter((r) => !r.t.dueAt || r.t.dueAt > endWeek),
  };
}

export const getDeadlineRules = () => db.select().from(deadlineRules).orderBy(asc(deadlineRules.ruleSet), asc(deadlineRules.trigger));
