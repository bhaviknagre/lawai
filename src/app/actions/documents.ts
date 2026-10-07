"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { documentIssues, documents, documentVersions, playbookRules } from "@/db/schema";
import { requireUser, type SessionUser } from "@/lib/auth";
import { assertCan, can } from "@/lib/permissions";
import { accessibleCaseIds, assertCaseAccess, caseScope } from "@/lib/access";
import { aiService } from "@/lib/ai-service";
import { deleteFile } from "@/lib/storage";
import { logActivity } from "@/lib/queries/common";

async function loadDoc(user: SessionUser, id: string) {
  const ids = await accessibleCaseIds(user);
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.firmId, user.firmId), caseScope(documents.caseId, ids)));
  if (!doc) throw new Error("Document not found");
  return doc;
}

/** Save new text as a new version and re-index it in the background. */
async function saveVersion(user: SessionUser, doc: typeof documents.$inferSelect, content: string, note: string) {
  const version = doc.version + 1;
  await db.transaction(async (tx) => {
    await tx.insert(documentVersions).values({ documentId: doc.id, version, content, note, createdBy: user.id });
    await tx.update(documents).set({ content, version, sizeBytes: content.length, ingestStatus: "pending" }).where(eq(documents.id, doc.id));
  });
  after(() => aiService.ingest(doc.id).catch((e) => console.error("[reingest]", e.message)));
}

export async function setDocStatus(id: string, status: "draft" | "in_review" | "final" | "signed" | "filed") {
  const user = await requireUser();
  if (status !== "draft" && status !== "in_review") assertCan(user, "documents.finalize");
  const doc = await loadDoc(user, id);
  await db.update(documents).set({ status }).where(eq(documents.id, id));
  await logActivity(user, { action: "doc_status", description: `${doc.title} marked ${status.replace("_", " ")}`, caseId: doc.caseId });
  revalidatePath(`/documents/${id}`);
}

export async function acceptIssue(issueId: string) {
  const user = await requireUser();
  const [issue] = await db.select().from(documentIssues).where(and(eq(documentIssues.id, issueId), eq(documentIssues.firmId, user.firmId)));
  if (!issue || issue.status !== "open") return;
  const doc = await loadDoc(user, issue.documentId);
  let content = doc.content ?? "";
  if (issue.originalText && issue.suggestedText && content.includes(issue.originalText)) {
    content = content.replace(issue.originalText, issue.suggestedText);
  } else if (issue.suggestedText) {
    content = insertClause(content, issue.clauseRef, issue.suggestedText);
  }
  await saveVersion(user, doc, content, `Accepted: ${issue.title}`);
  await db.update(documentIssues).set({ status: "accepted", resolvedBy: user.id }).where(eq(documentIssues.id, issueId));
  await logActivity(user, { action: "redline", description: `Accepted change in ${doc.title}: ${issue.title}`, caseId: doc.caseId });
  revalidatePath(`/documents/${doc.id}`);
}

/** Insert new clause text at the end of the referenced clause (e.g. "cl. 21"), else at the end. */
function insertClause(content: string, ref: string | null, text: string) {
  const num = ref?.match(/(\d{1,3})/)?.[1];
  if (num) {
    const start = content.search(new RegExp(`(^|\\n)${num}\\.\\s`));
    if (start >= 0) {
      const rest = content.slice(start + 1);
      const next = rest.search(/\n(\d{1,3}\.\s+[A-Z]|SCHEDULE|Schedule)/);
      const at = next >= 0 ? start + 1 + next : content.length;
      return `${content.slice(0, at).trimEnd()}\n${text}\n${content.slice(at)}`;
    }
  }
  return `${content.trimEnd()}\n\n${text}\n`;
}

export async function dismissIssue(issueId: string) {
  const user = await requireUser();
  const [issue] = await db.select().from(documentIssues).where(and(eq(documentIssues.id, issueId), eq(documentIssues.firmId, user.firmId)));
  if (!issue) return;
  await loadDoc(user, issue.documentId);
  await db.update(documentIssues).set({ status: "dismissed", resolvedBy: user.id }).where(eq(documentIssues.id, issueId));
  revalidatePath(`/documents/${issue.documentId}`);
}

export async function saveDocumentText(id: string, _: unknown, form: FormData) {
  const user = await requireUser();
  const doc = await loadDoc(user, id);
  const content = String(form.get("content") ?? "");
  if (content === doc.content) return { ok: true };
  await saveVersion(user, doc, content, String(form.get("note") || "Edited in LawAI"));
  await logActivity(user, { action: "edit", description: `Edited ${doc.title} (v${doc.version + 1})`, caseId: doc.caseId });
  revalidatePath(`/documents/${id}`);
  return { ok: true };
}

export async function appendToDocument(id: string, text: string) {
  const user = await requireUser();
  const doc = await loadDoc(user, id);
  await saveVersion(user, doc, `${(doc.content ?? "").trimEnd()}\n\n${text.trim()}\n`, "Inserted AI draft");
  await logActivity(user, { action: "edit", description: `Inserted drafted text into ${doc.title}`, caseId: doc.caseId });
  revalidatePath(`/documents/${id}`);
}

export async function restoreVersion(id: string, version: number) {
  const user = await requireUser();
  const doc = await loadDoc(user, id);
  const [v] = await db.select().from(documentVersions).where(and(eq(documentVersions.documentId, id), eq(documentVersions.version, version)));
  if (!v) return;
  await saveVersion(user, doc, v.content, `Restored v${version}`);
  revalidatePath(`/documents/${id}`);
}

export async function createDraftDocument(input: { title: string; content: string; caseId: string | null; kind: string }) {
  const user = await requireUser();
  if (input.caseId) await assertCaseAccess(user, input.caseId);
  const title = input.title.trim() || "Untitled draft";
  const [doc] = await db
    .insert(documents)
    .values({ firmId: user.firmId, caseId: input.caseId, title: title.endsWith(".docx") ? title : `${title}.docx`, kind: input.kind, content: input.content, sizeBytes: input.content.length, status: "draft", uploadedBy: user.id, mimeType: "text/plain" })
    .returning();
  await db.insert(documentVersions).values({ documentId: doc!.id, version: 1, content: input.content, note: "Drafted with LawAI", createdBy: user.id });
  await logActivity(user, { action: "draft", description: `Created draft ${doc!.title}`, caseId: input.caseId });
  after(() => aiService.ingest(doc!.id).catch((e) => console.error("[ingest]", e.message)));
  redirect(`/documents/${doc!.id}`);
}

export async function deleteDocument(id: string) {
  const user = await requireUser();
  assertCan(user, "documents.delete");
  const doc = await loadDoc(user, id);
  await db.delete(documents).where(eq(documents.id, id));
  if (doc.storageKey) await deleteFile(doc.storageKey);
  await logActivity(user, { action: "delete", description: `Deleted ${doc.title}`, caseId: doc.caseId });
  revalidatePath("/documents");
  redirect("/documents");
}

export async function reingest(id: string) {
  const user = await requireUser();
  await loadDoc(user, id);
  await db.update(documents).set({ ingestStatus: "pending" }).where(eq(documents.id, id));
  after(() => aiService.ingest(id, { reparse: true }).catch((e) => console.error("[ingest]", e.message)));
  revalidatePath(`/documents/${id}`);
}

// ── Playbook (settings) ─────────────────────────────────────────────
export async function addPlaybookRule(_: unknown, form: FormData) {
  const user = await requireUser();
  if (!can(user, "playbook.edit")) return { error: "Only admins can change the playbook." };
  const title = String(form.get("title") ?? "").trim();
  const rule = String(form.get("rule") ?? "").trim();
  if (!title || !rule) return { error: "Add a title and the rule text." };
  await db.insert(playbookRules).values({
    firmId: user.firmId,
    playbook: String(form.get("playbook") || "General"),
    documentKind: String(form.get("documentKind") || "Contract"),
    title,
    rule,
    severity: (String(form.get("severity")) as "high" | "medium" | "low") || "medium",
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function deletePlaybookRule(id: string) {
  const user = await requireUser();
  if (!can(user, "playbook.edit")) return;
  await db.delete(playbookRules).where(and(eq(playbookRules.id, id), eq(playbookRules.firmId, user.firmId)));
  revalidatePath("/settings");
}
