import Link from "next/link";
import { and, eq, ilike, or } from "drizzle-orm";
import { Sparkles } from "lucide-react";
import { db } from "@/db";
import { cases, clients, documents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { accessibleCaseIds, caseIn, caseScope } from "@/lib/access";
import { aiService } from "@/lib/ai-service";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const user = await requireUser();
  const ids = await accessibleCaseIds(user);
  const like = `%${q}%`;
  const [cs, cl, hits] = q.trim()
    ? await Promise.all([
        db.select().from(cases).where(and(caseIn(cases.id, ids), or(ilike(cases.title, like), ilike(cases.caseNumber, like), ilike(cases.opposingParty, like)))).limit(10),
        db.select().from(clients).where(and(eq(clients.firmId, user.firmId), or(ilike(clients.name, like), ilike(clients.primaryContact, like), ilike(clients.email, like)))).limit(10),
        // Full-text passages come from the AI service; if it's down, the rest of search still works.
        aiService.search({ userId: user.id, query: q, topK: 8 }).catch(() => []),
      ])
    : [[], [], []];
  const docTitles = q.trim()
    ? await db.select({ id: documents.id, title: documents.title }).from(documents).where(and(eq(documents.firmId, user.firmId), ilike(documents.title, like), caseScope(documents.caseId, ids))).limit(10)
    : [];
  const total = cs.length + cl.length + hits.length + docTitles.length;
  return (
    <>
      <PageHeader title={q ? `Results for “${q}”` : "Search"} sub={q ? `${total} results` : "Search cases, clients and the full text of documents"}>
        {q && <Link href={`/assistant?q=${encodeURIComponent(q)}`} className="btn btn-primary"><Sparkles size={17} />Ask LawAI instead</Link>}
      </PageHeader>
      {q && total === 0 && <div className="card"><Empty title="Nothing found">Try fewer words, a case number, or ask LawAI.</Empty></div>}
      {cs.length > 0 && (
        <section className="card overflow-hidden"><h2 className="h2 px-5 py-4">Cases</h2>
          {cs.map((c) => <Link key={c.id} href={`/cases/${c.id}`} className="block border-t border-[#eef0f3] px-5 py-3 hover:bg-sunken"><span className="font-semibold">{c.title}</span> <span className="font-mono text-[12.5px] text-muted">{c.caseNumber}</span></Link>)}
        </section>
      )}
      {cl.length > 0 && (
        <section className="card overflow-hidden"><h2 className="h2 px-5 py-4">Clients</h2>
          {cl.map((c) => <Link key={c.id} href={`/clients/${c.id}`} className="block border-t border-[#eef0f3] px-5 py-3 font-semibold hover:bg-sunken">{c.name}</Link>)}
        </section>
      )}
      {(docTitles.length > 0 || hits.length > 0) && (
        <section className="card overflow-hidden"><h2 className="h2 px-5 py-4">Documents</h2>
          {docTitles.map((d) => <Link key={d.id} href={`/documents/${d.id}`} className="block border-t border-[#eef0f3] px-5 py-3 font-semibold hover:bg-sunken">{d.title}</Link>)}
          {hits.map((h) => (
            <Link key={h.id} href={`/documents/${h.documentId}`} className="block border-t border-[#eef0f3] px-5 py-3 hover:bg-sunken">
              <div className="font-semibold">{h.documentTitle} <span className="font-normal text-muted">· {h.heading}</span></div>
              <p className="mt-1 line-clamp-2 font-serif text-[14.5px] text-muted">{h.content}</p>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
