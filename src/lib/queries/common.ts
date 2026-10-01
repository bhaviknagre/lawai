import "server-only";
import { asc, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { activities, jurisdictions, users } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";

export const getJurisdictions = cache(async () => db.select().from(jurisdictions).orderBy(asc(jurisdictions.name)));

export const jurisdictionMap = cache(async () => {
  const rows = await getJurisdictions();
  return Object.fromEntries(rows.map((j) => [j.code, j]));
});

export const getFirmUsers = cache(async (firmId: string) =>
  db.select({ id: users.id, name: users.name, title: users.title, color: users.color, role: users.role, weeklyTargetHours: users.weeklyTargetHours })
    .from(users)
    .where(eq(users.firmId, firmId))
    .orderBy(asc(users.name)),
);

export async function logActivity(user: SessionUser, a: { action: string; description: string; caseId?: string | null; clientId?: string | null }) {
  await db.insert(activities).values({ firmId: user.firmId, userId: user.id, ...a });
}
