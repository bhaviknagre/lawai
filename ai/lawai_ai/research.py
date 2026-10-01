"""Legal research: hybrid search over the authorities library, then an answer grounded only in what was found."""

from . import db, llm
from .config import MODELS, ai_enabled
from .rag.search import search_legal_sources


async def run_research(*, firm_id: str, user_id: str, query: str, jurisdictions: list[str]) -> dict:
    results = await search_legal_sources(query=query, jurisdictions=jurisdictions, top_k=8)
    answer = None
    if ai_enabled() and results:
        corpus = "\n\n".join(
            f"[{i + 1}] {r['title']} — {r['citation']} ({r['court'] or r['sourceType']}, {r['jurisdiction']})\n{r['summary']}\n{r['content'][:2500]}"
            for i, r in enumerate(results)
        )
        res = await llm.complete(
            model=MODELS["chat"],
            max_tokens=1500,
            system="You are a legal research assistant. Answer ONLY from the numbered authorities provided. Group the answer by jurisdiction using '### <Jurisdiction>' headings, keep each to 2–4 sentences, and cite authorities inline as [1], [2]. Open with a one-sentence overview. If the authorities don't answer the question, say so.",
            messages=[{"role": "user", "content": f"Question: {query}\n\nAuthorities:\n{corpus}"}],
        )
        await db.log_usage(firm_id=firm_id, user_id=user_id, feature="research", model=MODELS["chat"], input_tokens=res.input_tokens, output_tokens=res.output_tokens)
        answer = res.text.strip()
    await db.execute(
        "INSERT INTO research_queries (firm_id, user_id, query, jurisdictions, answer) VALUES (%s, %s, %s, %s, %s)",
        (firm_id, user_id, query, jurisdictions, answer),
    )
    return {"answer": answer, "results": results}
