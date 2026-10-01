import "server-only";
import { and, asc, count, desc, eq, gte, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activities, caseMembers, cases, clients, documents, events, tasks, users } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { accessibleCaseIds, caseIn } from "@/lib/access";

export type CaseFilters = { q?: string; area?: string; jurisdiction?: string; priority?: string; status?: string; assignee?: string; page?: number };
export const PAGE_SIZE = 12;

export async function listCases(user: SessionUser, f: CaseFilters) {
  const ids = await accessibleCaseIds(user);
  const where: SQL[] = [caseIn(cases.id, ids)];
  if (f.status && f.status !== "all") where.push(eq(cases.status, f.status as "active"));
  else if (!f.status) where.push(ne(cases.status, "closed"));
  if (f.area) where.push(eq(cases.practiceArea, f.area));
  if (f.jurisdiction) where.push(eq(cases.jurisdiction, f.jurisdiction));
  if (f.priority) where.push(eq(cases.priority, f.priority as "high"));
  if (f.assignee) where.push(sql`exists (select 1 from case_members m where m.case_id = ${cases.id} and m.user_id = ${f.assignee})`);
  if (f.q) {
    const q = `%${f.q}%`;
    where.push(or(ilike(cases.title, q), ilike(cases.caseNumber, q), ilike(clients.name, q), ilike(cases.opposingParty, q))!);
  }
  const page = Math.max(1, f.page ?? 1);
  const nextEvent = sql<Date | null>`(select min(e.starts_at) from events e where e.case_id = ${cases.id} and e.starts_at >= now())`;
  const nextTitle = sql<string | null>`(select e.title from events e where e.case_id = ${cases.id} and e.starts_at >= now() order by e.starts_at limit 1)`;

  const [rows, [{ total } = { total: 0 }], areas] = await Promise.all([
    db
      .select({ c: cases, client: clients.name, clientId: clients.id, nextAt: nextEvent, nextTitle })
      .from(cases)
      .innerJoin(clients, eq(clients.id, cases.clientId))
      .where(and(...where))
      .orderBy(sql`${nextEvent} asc nulls last`, desc(cases.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(cases).innerJoin(clients, eq(clients.id, cases.clientId)).where(and(...where)),
    db
      .select({ area: cases.practiceArea, n: count() })
      .from(cases)
      .where(and(caseIn(cases.id, ids), ne(cases.status, "closed")))
      .groupBy(cases.practiceArea)
      .orderBy(desc(count())),
  ]);
  const team = rows.length
    ? await db
        .select({ caseId: caseMembers.caseId, name: users.name, color: users.color })
        .from(caseMembers)
        .innerJoin(users, eq(users.id, caseMembers.userId))
        .where(caseIn(caseMembers.caseId, rows.map((r) => r.c.id)))
    : [];
  return {
    rows: rows.map((r) => ({ ...r, team: team.filter((t) => t.caseId === r.c.id) })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    areas,
  };
}

export async function getCaseDetail(user: SessionUser, id: string) {
  const ids = await accessibleCaseIds(user);
  if (!ids.includes(id)) return null;
  const [row] = await db
    .select({ c: cases, client: clients })
    .from(cases)
    .innerJoin(clients, eq(clients.id, cases.clientId))
    .where(eq(cases.id, id));
  if (!row) return null;
  const [team, ev, openTasks, docs, act] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, title: users.title, color: users.color, role: caseMembers.role })
      .from(caseMembers)
      .innerJoin(users, eq(users.id, caseMembers.userId))
      .where(eq(caseMembers.caseId, id)),
    db.select().from(events).where(and(eq(events.caseId, id), gte(events.startsAt, sql`now() - interval '1 day'`))).orderBy(asc(events.startsAt)).limit(12),
    db
      .select({ t: tasks, assignee: users.name })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.assigneeId))
      .where(and(eq(tasks.caseId, id), eq(tasks.status, "open")))
      .orderBy(asc(tasks.dueAt)),
    db.select().from(documents).where(eq(documents.caseId, id)).orderBy(desc(documents.updatedAt)),
    db
      .select({ a: activities, who: users.name })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.userId))
      .where(eq(activities.caseId, id))
      .orderBy(desc(activities.createdAt))
      .limit(12),
  ]);
  return { ...row, team, events: ev, tasks: openTasks, documents: docs, activity: act };
}

/** Options for create/filter forms. */
export async function caseOptions(user: SessionUser) {
  const ids = await accessibleCaseIds(user);
  return db
    .select({ id: cases.id, title: cases.title })
    .from(cases)
    .where(and(caseIn(cases.id, ids), ne(cases.status, "closed")))
    .orderBy(asc(cases.title));
}

export async function clientOptions(user: SessionUser) {
  return db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.firmId, user.firmId)).orderBy(asc(clients.name));
}
