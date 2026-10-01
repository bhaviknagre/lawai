"""
Hybrid retrieval:
  1. dense   — pgvector HNSW cosine search over contextualised embeddings
  2. sparse  — Postgres full-text (BM25-like ts_rank_cd) — catches exact clause numbers, names, citations
  3. fuse    — Reciprocal Rank Fusion (k = 60)
  4. rerank  — Voyage cross-encoder on the fused shortlist
Permission filtering happens inside the SQL, before anything reaches the model.
Results use camelCase keys: they go straight back to the Next.js UI.
"""

import asyncio
import re
from typing import Any

from .. import db
from ..access import case_scope
from ..db import Where
from .embeddings import embed, rerank, to_vector

RRF_K = 60
CANDIDATES = 30


def or_query(q: str) -> str | None:
    """OR-joined, sanitised tsquery so natural-language questions still match partially."""
    terms: list[str] = []
    for t in re.split(r"[^a-z0-9.]+", q.lower().replace("§", " ")):
        t = t.strip(".")
        if len(t) > 1 and t not in terms:
            terms.append(t)
    return " | ".join(terms[:24]) or None


def rrf(lists: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Reciprocal Rank Fusion. Returns [{"item", "score"}], best first."""
    scores: dict[str, dict[str, Any]] = {}
    for lst in lists:
        for rank, item in enumerate(lst):
            s = 1 / (RRF_K + rank + 1)
            if item["id"] in scores:
                scores[item["id"]]["score"] += s
            else:
                scores[item["id"]] = {"item": item, "score": s}
    return sorted(scores.values(), key=lambda f: f["score"], reverse=True)


def boost_clause_refs(query: str, fused: list[dict[str, Any]]) -> None:
    """Lawyers search by clause number ("what does 14.2 say?"): boost chunks containing that exact reference."""
    refs = re.findall(r"\b\d{1,3}(?:\.\d{1,3})+\b", query)
    if not refs:
        return
    for f in fused:
        if any(re.search(rf"(^|\s){re.escape(r)}\b", f["item"]["content"], re.M) for r in refs):
            f["score"] += 0.05
    fused.sort(key=lambda f: f["score"], reverse=True)


async def _none() -> list:
    return []


async def _query_vector(query: str) -> str | None:
    """Embedding for the query; on provider errors (rate limits, outages) search degrades to keyword-only."""
    try:
        vecs = await embed([query], "query")
    except Exception as e:
        print(f"[search] query embedding failed, using keyword search only: {e}")
        return None
    return to_vector(vecs[0]) if vecs else None


CHUNK_COLS = """dc.id, dc.document_id AS "documentId", d.title AS "documentTitle", dc.case_id AS "caseId",
  c.title AS "caseTitle", dc.heading, dc.page_number AS "pageNumber", dc.content, dc.context"""
CHUNK_FROM = "document_chunks dc JOIN documents d ON d.id = dc.document_id LEFT JOIN cases c ON c.id = dc.case_id"


async def search_documents(
    *, firm_id: str, case_ids: list[str], query: str, case_id: str | None = None, document_id: str | None = None, top_k: int = 8
) -> list[dict[str, Any]]:
    w = Where().add("dc.firm_id = %s", firm_id)
    case_scope(w, "dc.case_id", case_ids)
    if case_id:
        w.add("dc.case_id = %s", case_id)
    if document_id:
        w.add("dc.document_id = %s", document_id)

    tsq = or_query(query)
    vec = await _query_vector(query)

    dense, sparse = await asyncio.gather(
        db.fetch(
            f"SELECT {CHUNK_COLS} FROM {CHUNK_FROM} WHERE {w.sql()} AND dc.embedding IS NOT NULL ORDER BY dc.embedding <=> %s::vector LIMIT {CANDIDATES}",
            [*w.params, vec],
        ) if vec else _none(),
        db.fetch(
            f"""SELECT {CHUNK_COLS} FROM {CHUNK_FROM} WHERE {w.sql()} AND dc.tsv @@ to_tsquery('english', %s)
                ORDER BY ts_rank_cd(dc.tsv, to_tsquery('english', %s), 32) DESC LIMIT {CANDIDATES}""",
            [*w.params, tsq, tsq],
        ) if tsq else _none(),
    )

    fused = rrf([dense, sparse])[:20]
    boost_clause_refs(query, fused)
    # Scoped to one document and nothing matched? Return its opening chunks so the model still has context.
    if not fused and document_id:
        first = await db.fetch(f"SELECT {CHUNK_COLS} FROM {CHUNK_FROM} WHERE {w.sql()} ORDER BY dc.chunk_index LIMIT %s", [*w.params, top_k])
        return [{**r, "score": 0} for r in first]
    order = await rerank(query, ["\n".join(x for x in (f["item"]["context"], f["item"]["heading"], f["item"]["content"]) if x) for f in fused], top_k)
    if order:
        fused = [fused[i] for i in order if i < len(fused)]
    return [{**f["item"], "score": round(f["score"], 4)} for f in fused[:top_k]]


SOURCE_COLS = """id, title, citation, court, jurisdiction, source_type AS "sourceType", year, topics, summary, content, url, created_at AS "createdAt\""""


async def search_legal_sources(*, query: str, jurisdictions: list[str] | None = None, top_k: int = 6) -> list[dict[str, Any]]:
    w = Where()
    if jurisdictions:
        w.add("jurisdiction = ANY(%s)", jurisdictions)
    tsq = or_query(query)
    vec = await _query_vector(query)

    dense, sparse = await asyncio.gather(
        db.fetch(
            f"SELECT {SOURCE_COLS} FROM legal_sources WHERE {w.sql()} AND embedding IS NOT NULL ORDER BY embedding <=> %s::vector LIMIT {CANDIDATES}",
            [*w.params, vec],
        ) if vec else _none(),
        db.fetch(
            f"""SELECT {SOURCE_COLS} FROM legal_sources WHERE {w.sql()} AND tsv @@ to_tsquery('english', %s)
                ORDER BY ts_rank_cd(tsv, to_tsquery('english', %s), 32) DESC LIMIT {CANDIDATES}""",
            [*w.params, tsq, tsq],
        ) if tsq else _none(),
    )
    fused = rrf([dense, sparse])[:20]
    order = await rerank(query, [f"{f['item']['title']}\n{f['item']['summary']}\n{f['item']['content']}" for f in fused], top_k)
    if order:
        fused = [fused[i] for i in order if i < len(fused)]
    return [{**f["item"], "score": f["score"]} for f in fused[:top_k]]
