"""
Embedding + reranking providers.
Default: Voyage AI — voyage-law-2 is tuned for legal retrieval, rerank-2 for precision.
EMBEDDING_PROVIDER=none disables vectors; search then runs on Postgres full-text only.
"""

import asyncio
from typing import Any, Literal
from urllib.parse import urlparse

import httpx

from ..config import EMBEDDING_DIMS, embedding_provider, env


def embeddings_enabled() -> bool:
    return embedding_provider() != "none"


async def embed(texts: list[str], kind: Literal["document", "query"]) -> list[list[float]] | None:
    p = embedding_provider()
    if p == "none" or not texts:
        return None
    out: list[list[float]] = []
    size = 64 if p == "voyage" else 256
    for i in range(0, len(texts), size):
        batch = [t[:16000] for t in texts[i : i + size]]
        out.extend(await (_voyage(batch, kind) if p == "voyage" else _openai(batch)))
    return out


def _vectors(res: dict[str, Any]) -> list[list[float]]:
    return [d["embedding"] for d in sorted(res["data"], key=lambda d: d["index"])]


async def _voyage(texts: list[str], kind: str) -> list[list[float]]:
    return _vectors(await _post(
        "https://api.voyageai.com/v1/embeddings",
        env("VOYAGE_API_KEY"),
        {"input": texts, "model": env("VOYAGE_EMBED_MODEL", "voyage-law-2"), "input_type": kind},
    ))


async def _openai(texts: list[str]) -> list[list[float]]:
    return _vectors(await _post(
        "https://api.openai.com/v1/embeddings",
        env("OPENAI_API_KEY"),
        {"input": texts, "model": "text-embedding-3-large", "dimensions": EMBEDDING_DIMS},
    ))


async def rerank(query: str, documents: list[str], top_k: int) -> list[int] | None:
    """Cross-encoder rerank. Returns indices into `documents`, best first. None when unavailable."""
    if embedding_provider() != "voyage" or not documents:
        return None
    try:
        res = await _post(
            "https://api.voyageai.com/v1/rerank",
            env("VOYAGE_API_KEY"),
            {"query": query, "documents": [d[:8000] for d in documents], "model": env("VOYAGE_RERANK_MODEL", "rerank-2"), "top_k": top_k},
        )
        return [d["index"] for d in res["data"]]
    except Exception as e:
        print(f"[rerank] skipped: {e}")
        return None


async def _post(url: str, key: str | None, body: dict[str, Any], tries: int = 3) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=60) as client:
        for attempt in range(1, tries + 1):
            res = await client.post(url, json=body, headers={"Authorization": f"Bearer {key}"})
            if res.is_success:
                return res.json()
            if attempt >= tries or (res.status_code < 500 and res.status_code != 429):
                raise RuntimeError(f"{urlparse(url).hostname} {res.status_code}: {res.text[:300]}")
            await asyncio.sleep(0.5 * 2**attempt)
    raise RuntimeError("unreachable")


def to_vector(v: list[float] | None) -> str | None:
    """pgvector text literal, passed as %s::vector."""
    return None if v is None else "[" + ",".join(str(x) for x in v) + "]"
