"""One-shot drafting of a clause or a whole document, optionally matched to an existing document's style."""

from typing import Literal

from . import db, llm
from .config import MODELS


async def draft_text(
    *,
    firm_id: str,
    user_id: str,
    instruction: str,
    tone: str | None = None,
    document_id: str | None = None,
    kind: Literal["clause", "document"] = "clause",
) -> str:
    context = ""
    if document_id:
        doc = await db.fetchrow("SELECT title, content FROM documents WHERE id = %s AND firm_id = %s", (document_id, firm_id))
        if doc and doc["content"]:
            context = f"\n\nThe text will be added to this document — match its defined terms, numbering and style:\n<document title=\"{doc['title']}\">\n{doc['content'][:100_000]}\n</document>"
    what = (
        "Draft a complete document. Start with the title on its own line in capitals, then numbered clauses."
        if kind == "document"
        else "Draft only the requested clause(s), numbered to fit the document. No commentary."
    )
    res = await llm.complete(
        model=MODELS["chat"],
        max_tokens=8000 if kind == "document" else 2000,
        system=f"You are an experienced lawyer drafting precise, enforceable text. {what} Mark missing facts as [PLACEHOLDER]. Output plain text only, no markdown.",
        messages=[{"role": "user", "content": f"Instruction: {instruction}\nTone/position: {tone or 'Balanced'}{context}"}],
    )
    await db.log_usage(firm_id=firm_id, user_id=user_id, feature="draft", model=MODELS["chat"], input_tokens=res.input_tokens, output_tokens=res.output_tokens)
    return res.text.strip()
