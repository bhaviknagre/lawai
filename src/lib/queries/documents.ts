import "server-only";
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { cases, documentIssues, documents, documentVersions, users } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { accessibleCaseIds, caseScope } from "@/lib/access";

export async function listDocuments(user: SessionUser, f: { q?: string; kind?: string; case?: string; status?: string; ingest?: string }) {
  const ids = await accessibleCaseIds(user);
  const base: SQL[] = [eq(documents.firmId, user.firmId), caseScope(documents.caseId, ids)];
  const where = [...base];
  if (f.kind) where.push(eq(documents.kind, f.kind));
  if (f.case) where.push(eq(documents.caseId, f.case));
  if (f.status) where.push(eq(documents.status, f.status as "draft"));
  if (f.ingest) where.push(eq(documents.ingestStatus, f.ingest as "failed"));
  if (f.q) {
    const q = `%${f.q}%`;
    // Title match OR full-text match inside the document.
    where.push(or(ilike(documents.title, q), sql`to_tsvector('english', coalesce(${documents.content}, '')) @@ plainto_tsquery('english', ${f.q})`)!);
  }
  const issues = sql<number>`(select count(*) from document_issues i where i.document_id = ${documents.id} and i.status = 'open')`.mapWith(Number);
  const high = sql<number>`(select count(*) from document_issues i where i.document_id = ${documents.id} and i.status = 'open' and i.severity = 'high')`.mapWith(Number);
  const reviewed = sql<boolean>`exists (select 1 from document_issues i where i.document_id = ${documents.id})`;
  const [rows, kinds, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({ d: documents, caseTitle: cases.title, issues, high, reviewed })
      .from(documents)
      .leftJoin(cases, eq(cases.id, documents.caseId))
      .where(and(...where))
      .orderBy(desc(documents.updatedAt))
      .limit(100),
    db.select({ kind: documents.kind, n: count() }).from(documents).where(and(...base)).groupBy(documents.kind).orderBy(asc(documents.kind)),
    db.select({ total: count() }).from(documents).where(and(...base)),
  ]);
  return { rows, kinds, total };
}

export async function getDocument(user: SessionUser, id: string) {
  const ids = await accessibleCaseIds(user);
  const [row] = await db
    .select({ d: documents, caseTitle: cases.title, uploader: users.name })
    .from(documents)
    .leftJoin(cases, eq(cases.id, documents.caseId))
    .leftJoin(users, eq(users.id, documents.uploadedBy))
    .where(and(eq(documents.id, id), eq(documents.firmId, user.firmId), caseScope(documents.caseId, ids)));
  if (!row) return null;
  const [issues, versions] = await Promise.all([
    db
      .select()
      .from(documentIssues)
      .where(eq(documentIssues.documentId, id))
      .orderBy(sql`case ${documentIssues.status} when 'open' then 0 else 1 end`, sql`case ${documentIssues.severity} when 'high' then 0 when 'medium' then 1 else 2 end`),
    db
      .select({ v: documentVersions, who: users.name })
      .from(documentVersions)
      .leftJoin(users, eq(users.id, documentVersions.createdBy))
      .where(eq(documentVersions.documentId, id))
      .orderBy(desc(documentVersions.version))
      .limit(10),
  ]);
  return { ...row, issues, versions };
}
