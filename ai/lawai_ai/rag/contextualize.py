"""
Contextual Retrieval (Anthropic, 2024): before embedding, ask a small model to write 1–2 sentences
situating each chunk within the whole document ("This is clause 14.2 of the Johnson Corp supply
agreement, capping the supplier's liability…"). Chunks stop being orphaned fragments, and both
vector and keyword search get markedly better recall.

The full document is sent once per chunk but marked for prompt caching (Anthropic), so after the first
call it is read from the cache at a fraction of the cost.
"""

import asyncio

from .. import llm
from ..config import MODELS, contextual_enabled
from ..db import log_usage
from .chunk import Chunk

DOC_LIMIT = 120_000  # chars of document context we send
CONCURRENCY = 4


async def contextualize_chunks(*, firm_id: str, document_title: str, full_text: str, chunks: list[Chunk]) -> list[str | None]:
    if not contextual_enabled() or len(chunks) < 2:
        return [None] * len(chunks)
    system = f"You help index legal documents for search. Document title: {document_title}\n\n<document>\n{full_text[:DOC_LIMIT]}\n</document>"
    sem = asyncio.Semaphore(CONCURRENCY)

    async def one(i: int, c: Chunk) -> str | None:
        async with sem:
            try:
                res = await llm.complete(
                    model=MODELS["fast"],
                    max_tokens=160,
                    system=system,
                    cache_system=True,
                    messages=[{
                        "role": "user",
                        "content": f"<chunk>\n{c.content}\n</chunk>\n\nWrite one or two sentences that situate this chunk within the document: name the document type and parties, the clause/section number and its subject, and any defined terms needed to understand it. Answer with only that context.",
                    }],
                )
                await log_usage(firm_id=firm_id, user_id=None, feature="ingest", model=MODELS["fast"], input_tokens=res.input_tokens, output_tokens=res.output_tokens)
                return res.text.strip() or None
            except Exception as e:
                print(f"[contextualize] chunk {i}: {e}")
                return None

    return list(await asyncio.gather(*(one(i, c) for i, c in enumerate(chunks))))
