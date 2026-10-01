import Link from "next/link";
import { desc, eq, count } from "drizzle-orm";
import { db } from "@/db";
import { legalSources, researchQueries } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getJurisdictions } from "@/lib/queries/common";
import { PageHeader } from "@/components/ui";
import { ago } from "@/lib/utils";
import { Research } from "./research";

export const metadata = { title: "Legal research" };

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const user = await requireUser();
  const [jur, recent, [lib]] = await Promise.all([
    getJurisdictions(),
    db.select().from(researchQueries).where(eq(researchQueries.userId, user.id)).orderBy(desc(researchQueries.createdAt)).limit(8),
    db.select({ n: count() }).from(legalSources),
  ]);
  const enabled = jur.filter((j) => user.firmJurisdictions.includes(j.code) || ["IN"].includes(j.code));
  return (
    <>
      <PageHeader title="Legal research" sub={`Search ${lib?.n ?? 0} authorities in your research library, with an AI summary cited by jurisdiction.`} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Research jurisdictions={enabled} initialQuery={q} initialJur={[]} />
        <aside className="card h-fit p-4">
          <h2 className="h2 mb-2">Your recent research</h2>
          <ul className="flex flex-col">
            {recent.map((r) => (
              <li key={r.id}><Link href={`/research?q=${encodeURIComponent(r.query)}`} className="block rounded-lg px-2 py-2 hover:bg-sunken"><span className="block text-[14px] font-medium">{r.query}</span><span className="text-[12px] text-muted">{ago(r.createdAt)}</span></Link></li>
            ))}
            {recent.length === 0 && <li className="text-[13.5px] text-muted">Your searches will appear here.</li>}
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-[12.5px] text-muted">The demo library holds a curated sample. In production, connect licensed sources (see README → Legal data).</p>
        </aside>
      </div>
    </>
  );
}
