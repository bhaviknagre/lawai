import "server-only";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activities, cases, clients, users } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { accessibleCaseIds, caseIn } from "@/lib/access";

export async function listClients(user: SessionUser, f: { q?: string; type?: string }) {
  const where: SQL[] = [eq(clients.firmId, user.firmId)];
  if (f.type) where.push(eq(clients.type, f.type as "company"));
  if (f.q) {
    const q = `%${f.q}%`;
    where.push(or(ilike(clients.name, q), ilike(clients.primaryContact, q), ilike(clients.email, q), ilike(clients.location, q))!);
  }
  return db
    .select({
      c: clients,
      activeMatters: sql<number>`(select count(*) from cases x where x.client_id = ${clients.id} and x.status <> 'closed')`.mapWith(Number),
      lastActivity: sql<Date | null>`(select max(a.created_at) from activities a where a.client_id = ${clients.id})`,
    })
    .from(clients)
    .where(and(...where))
    .orderBy(asc(clients.name));
}

export async function getClientDetail(user: SessionUser, id: string) {
  const [c] = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.firmId, user.firmId)));
  if (!c) return null;
  const ids = await accessibleCaseIds(user);
  const [matters, act] = await Promise.all([
    db.select().from(cases).where(and(eq(cases.clientId, id), caseIn(cases.id, ids))).orderBy(desc(cases.updatedAt)),
    db
      .select({ a: activities, who: users.name })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.userId))
      .where(eq(activities.clientId, id))
      .orderBy(desc(activities.createdAt))
      .limit(10),
  ]);
  return { client: c, matters, activity: act };
}
