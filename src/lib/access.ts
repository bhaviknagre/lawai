import "server-only";
import { and, eq, inArray, isNull, or, type SQL, type Column } from "drizzle-orm";
import { db } from "@/db";
import { caseMembers, cases } from "@/db/schema";
import type { SessionUser } from "./auth";

/**
 * Matter-level access control.
 * Admins see every matter in their firm. Everyone else sees only matters they're staffed on.
 * Every query that touches case-scoped data goes through these helpers — including the AI tools,
 * so the assistant can never retrieve a matter the user couldn't open themselves.
 */
export async function accessibleCaseIds(user: SessionUser): Promise<string[]> {
  if (user.role === "admin") {
    const rows = await db.select({ id: cases.id }).from(cases).where(eq(cases.firmId, user.firmId));
    return rows.map((r) => r.id);
  }
  const rows = await db
    .select({ id: caseMembers.caseId })
    .from(caseMembers)
    .innerJoin(cases, eq(cases.id, caseMembers.caseId))
    .where(and(eq(caseMembers.userId, user.id), eq(cases.firmId, user.firmId)));
  return rows.map((r) => r.id);
}

/** WHERE fragment for tables with a nullable case_id: firm-wide rows OR rows on an accessible matter. */
export function caseScope(column: Column, ids: string[]): SQL {
  if (ids.length === 0) return isNull(column);
  return or(isNull(column), inArray(column, ids))!;
}

/** WHERE fragment for tables where case_id is required. */
export function caseIn(column: Column, ids: string[]): SQL {
  return inArray(column, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
}

export async function assertCaseAccess(user: SessionUser, caseId: string) {
  const ids = await accessibleCaseIds(user);
  if (!ids.includes(caseId)) throw new Error("You don't have access to this matter.");
}
