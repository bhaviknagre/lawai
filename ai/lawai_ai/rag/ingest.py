"""
Ingestion pipeline:  file → text → structure-aware chunks → contextual notes → embeddings → Postgres.
Idempotent: re-running replaces the document's chunks (used after edits / accepted redlines).
"""

from psycopg.types.json import Jsonb

from .. import db, llm
from ..config import MODELS, ai_enabled
from ..storage import get_file
from .chunk import chunk_text, page_for_offset
from .contextualize import contextualize_chunks
from .embeddings import embed, to_vector


async def ingest_document(document_id: str, *, reparse: bool = False) -> dict:
    doc = await db.fetchrow("SELECT * FROM documents WHERE id = %s", (document_id,))
    if not doc:
        raise LookupError("Document not found")
    await db.execute("UPDATE documents SET ingest_status = 'processing', ingest_error = NULL, updated_at = now() WHERE id = %s", (doc["id"],))

    try:
        text = doc["content"]
        page_offsets = doc["page_offsets"]
        page_count = doc["page_count"]
        if (not text or reparse) and doc["storage_key"]:
            from .parse import parse_file

            parsed = parse_file(await get_file(doc["storage_key"]), doc["mime_type"], doc["title"])
            text, page_offsets, page_count = parsed.text, parsed.page_offsets, parsed.page_count
        if not text or not text.strip():
            raise ValueError("The document has no readable text.")

        chunks = chunk_text(text)
        contexts = await contextualize_chunks(firm_id=doc["firm_id"], document_title=doc["title"], full_text=text, chunks=chunks)
        vectors = await embed(["\n".join(x for x in (contexts[i], c.heading, c.content) if x) for i, c in enumerate(chunks)], "document")
        summary = doc["summary"] or await _summarize(doc["firm_id"], doc["title"], text)

        async with db.transaction() as conn:
            await conn.execute("DELETE FROM document_chunks WHERE document_id = %s", (doc["id"],))
            if chunks:
                async with conn.cursor() as cur:
                    await cur.executemany(
                        """INSERT INTO document_chunks
                             (document_id, firm_id, case_id, chunk_index, heading, page_number, content, context, token_count, embedding)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector)""",
                        [
                            (doc["id"], doc["firm_id"], doc["case_id"], c.index, c.heading, page_for_offset(page_offsets, c.start),
                             c.content, contexts[i], c.tokens, to_vector(vectors[i]) if vectors else None)
                            for i, c in enumerate(chunks)
                        ],
                    )
            await conn.execute(
                """UPDATE documents SET content = %s, page_offsets = %s, page_count = %s, summary = %s,
                     ingest_status = 'ready', ingest_error = NULL, updated_at = now()
                   WHERE id = %s""",
                (text, Jsonb(page_offsets) if page_offsets is not None else None, page_count, summary, doc["id"]),
            )
        return {"chunks": len(chunks), "embedded": bool(vectors)}
    except Exception as e:
        await db.execute("UPDATE documents SET ingest_status = 'failed', ingest_error = %s WHERE id = %s", (str(e)[:500], doc["id"]))
        raise


async def ingest_pending(*, limit: int | None = 10, include_failed: bool = False, include_all: bool = False, stale_minutes: int = 10) -> list[dict]:
    """Documents stuck in pending/processing (e.g. a restart mid-ingest), optionally failed ones, or every document with include_all."""
    if include_all:
        rows = await db.fetch("SELECT id, title FROM documents ORDER BY created_at")
    else:
        rows = await db.fetch(
            f"""SELECT id, title FROM documents
                WHERE ingest_status = 'pending' {"OR ingest_status = 'failed'" if include_failed else ''}
                   OR (ingest_status = 'processing' AND updated_at < now() - make_interval(mins => %s))
                ORDER BY created_at {'LIMIT %s' if limit else ''}""",
            (stale_minutes, limit) if limit else (stale_minutes,),
        )
    results = []
    for r in rows:
        try:
            results.append({"id": r["id"], "title": r["title"], **(await ingest_document(r["id"]))})
        except Exception as e:
            results.append({"id": r["id"], "title": r["title"], "error": str(e)})
    return results


async def _summarize(firm_id: str, title: str, text: str) -> str | None:
    if not ai_enabled():
        return None
    try:
        res = await llm.complete(
            model=MODELS["fast"],
            max_tokens=200,
            messages=[{
                "role": "user",
                "content": f"Summarise this legal document in two plain-English sentences for a lawyer's file list: what it is, who the parties are, and what it mainly does.\n\nTitle: {title}\n\n{text[:60_000]}",
            }],
        )
        await db.log_usage(firm_id=firm_id, user_id=None, feature="ingest", model=MODELS["fast"], input_tokens=res.input_tokens, output_tokens=res.output_tokens)
        return res.text.strip() or None
    except Exception:
        return None
