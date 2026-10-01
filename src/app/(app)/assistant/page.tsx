import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { cases, conversations, documents, messages } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { accessibleCaseIds, caseIn, caseScope } from "@/lib/access";
import { aiStatus } from "@/lib/ai-service";
import { Chat } from "./chat";

export const metadata = { title: "AI Assistant" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string; case?: string; doc?: string; mode?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const ids = await accessibleCaseIds(user);
  const [history, caseList, docList, status] = await Promise.all([
    db.select({ id: conversations.id, title: conversations.title, updatedAt: conversations.updatedAt, caseTitle: cases.title })
      .from(conversations).leftJoin(cases, eq(cases.id, conversations.caseId))
      .where(eq(conversations.userId, user.id)).orderBy(desc(conversations.updatedAt)).limit(40),
    db.select({ id: cases.id, title: cases.title }).from(cases).where(and(caseIn(cases.id, ids), ne(cases.status, "closed"))).orderBy(asc(cases.title)),
    db.select({ id: documents.id, title: documents.title }).from(documents).where(and(eq(documents.firmId, user.firmId), caseScope(documents.caseId, ids))).orderBy(asc(documents.title)),
    aiStatus(),
  ]);
  let initial: { id: string; caseId: string | null; documentId: string | null; messages: (typeof messages.$inferSelect)[] } | null = null;
  if (sp.c) {
    const [conv] = await db.select().from(conversations).where(and(eq(conversations.id, sp.c), eq(conversations.userId, user.id)));
    if (conv) {
      const rows = await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(asc(messages.createdAt));
      initial = { id: conv.id, caseId: conv.caseId, documentId: conv.documentId, messages: rows };
    }
  }
  return (
    <div className="-mx-4 -mb-12 -mt-6 lg:-mx-8">
      <Chat
        key={initial?.id ?? `new-${sp.q ?? ""}-${sp.case ?? ""}-${sp.doc ?? ""}`}
        history={history.map((h) => ({ ...h, updatedAt: h.updatedAt.toISOString() }))}
        cases={caseList}
        docs={docList}
        initial={initial ? { ...initial, messages: initial.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, sources: m.sources, feedback: m.feedback })) } : null}
        initialQuestion={sp.q}
        initialCaseId={sp.case}
        initialDocId={sp.doc}
        initialMode={sp.mode === "draft" || sp.mode === "research" ? sp.mode : "chat"}
        status={{ ai: status.ai, embeddings: status.embeddings !== "none" }}
      />
    </div>
  );
}
