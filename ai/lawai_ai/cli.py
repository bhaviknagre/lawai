"""
Data-engineering commands, run from ai/:
  uv run python -m lawai_ai.cli ingest            # pending + failed documents
  uv run python -m lawai_ai.cli ingest --all      # re-index every document (e.g. after adding VOYAGE_API_KEY)
  uv run python -m lawai_ai.cli embed-sources     # embed legal sources that have no vector yet (--all to redo)
  uv run python -m lawai_ai.cli index             # embed-sources, then ingest (used after seeding)
"""

import argparse
import asyncio

from . import db
from .config import PROVIDER, embedding_provider
from .rag.embeddings import embed, embeddings_enabled, to_vector
from .rag.ingest import ingest_pending


async def cmd_ingest(include_all: bool) -> None:
    print(f"Ingesting (LLM: {PROVIDER}, embeddings: {embedding_provider()})…")
    results = await ingest_pending(limit=None, include_failed=True, include_all=include_all)
    if not results:
        print("  Nothing to ingest.")
    for r in results:
        if "error" in r:
            print(f"  ✗ {r['title']}: {r['error']}")
        else:
            print(f"  ✓ {r['title']} → {r['chunks']} chunks{' (embedded)' if r['embedded'] else ''}")


async def cmd_embed_sources(include_all: bool) -> None:
    if not embeddings_enabled():
        print("Embeddings are off (no VOYAGE_API_KEY / OPENAI_API_KEY); legal sources use full-text search only.")
        return
    rows = await db.fetch(
        f"SELECT id, title, citation, summary, content FROM legal_sources {'' if include_all else 'WHERE embedding IS NULL'}"
    )
    print(f"Embedding {len(rows)} legal source(s)…")
    vectors = await embed([f"{r['title']}\n{r['citation']}\n{r['summary']}\n{r['content']}" for r in rows], "document") or []
    async with db.transaction() as conn:
        async with conn.cursor() as cur:
            await cur.executemany(
                "UPDATE legal_sources SET embedding = %s::vector WHERE id = %s",
                [(to_vector(v), r["id"]) for r, v in zip(rows, vectors)],
            )


async def main() -> None:
    parser = argparse.ArgumentParser(prog="lawai_ai.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    for name in ("ingest", "embed-sources", "index"):
        sub.add_parser(name).add_argument("--all", action="store_true")
    args = parser.parse_args()
    if args.cmd in ("embed-sources", "index"):
        await cmd_embed_sources(args.all)
    if args.cmd in ("ingest", "index"):
        await cmd_ingest(args.all)


if __name__ == "__main__":
    asyncio.run(main())
