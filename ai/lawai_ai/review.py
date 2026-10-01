"""
Contract review against the firm's playbook.
Structured output is enforced with a forced tool call, so we always get valid JSON.
`original_text` must be copied verbatim from the document so redlines can be applied automatically;
we verify that and drop the suggestion if the model paraphrased.
"""

from . import db, llm
from .config import MODELS
from .llm import Tool

REPORT_TOOL = Tool(
    name="report_issues",
    description="Report every issue found in the document.",
    input_schema={
        "type": "object",
        "properties": {
            "issues": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "severity": {"type": "string", "enum": ["high", "medium", "low"]},
                        "clause_ref": {"type": "string", "description": "e.g. 'cl. 14.2'"},
                        "title": {"type": "string", "description": "Short headline, max 8 words."},
                        "explanation": {"type": "string", "description": "Why this matters for OUR client, 1–3 sentences."},
                        "original_text": {"type": "string", "description": "Exact text copied verbatim from the document that should change. Empty if something is missing."},
                        "suggested_text": {"type": "string", "description": "Replacement text (or new clause text if something is missing)."},
                        "playbook_rule_id": {"type": "string", "description": "id of the playbook rule this relates to, if any."},
                    },
                    "required": ["severity", "title", "explanation", "suggested_text"],
                },
            }
        },
        "required": ["issues"],
    },
)


async def review_document(*, document_id: str, firm_id: str, user_id: str, our_side: str | None = None) -> int:
    doc = await db.fetchrow("SELECT * FROM documents WHERE id = %s AND firm_id = %s", (document_id, firm_id))
    if not doc or not doc["content"]:
        raise ValueError("This document has no text to review yet.")
    rules = await db.fetch("SELECT * FROM playbook_rules WHERE firm_id = %s AND document_kind = %s", (firm_id, doc["kind"]))
    playbook = (
        "\n".join(f"- [{r['id']}] ({r['severity']}) {r['title']}: {r['rule']}" for r in rules)
        if rules
        else "No playbook rules for this document type. Use standard market practice for the client's side."
    )

    res = await llm.complete(
        model=MODELS["chat"],
        max_tokens=4096,
        tools=[REPORT_TOOL],
        force_tool=REPORT_TOOL.name,
        system="You are a senior commercial lawyer reviewing a document for your client. Compare it with the firm playbook and flag deviations, missing protections and drafting risks. Be specific and practical. Do not flag cosmetic issues.",
        messages=[{
            "role": "user",
            "content": f"Our side: {our_side or 'the client named in the matter (if a supply agreement, assume we act for the Customer)'}.\n\nPlaybook rules:\n{playbook}\n\nDocument \"{doc['title']}\" ({doc['kind']}):\n<document>\n{doc['content'][:180_000]}\n</document>",
        }],
    )
    await db.log_usage(firm_id=firm_id, user_id=user_id, feature="review", model=MODELS["chat"], input_tokens=res.input_tokens, output_tokens=res.output_tokens)

    call = next((c for c in res.tool_calls if c.name == REPORT_TOOL.name), None)
    issues = [i for i in (call.input.get("issues") if call else None) or [] if isinstance(i, dict)]
    rule_ids = {r["id"] for r in rules}

    rows = []
    for i in issues:
        original = (i.get("original_text") or "").strip() or None
        rows.append((
            doc["id"],
            firm_id,
            i.get("severity") if i.get("severity") in ("high", "medium", "low") else "medium",
            i.get("clause_ref"),
            str(i.get("title", ""))[:200],
            str(i.get("explanation", "")),
            original if original and original in doc["content"] else None,
            i.get("suggested_text"),
            i.get("playbook_rule_id") if i.get("playbook_rule_id") in rule_ids else None,
        ))

    async with db.transaction() as conn:
        await conn.execute("DELETE FROM document_issues WHERE document_id = %s AND status = 'open'", (doc["id"],))
        if rows:
            async with conn.cursor() as cur:
                await cur.executemany(
                    """INSERT INTO document_issues
                         (document_id, firm_id, severity, clause_ref, title, explanation, original_text, suggested_text, playbook_rule_id)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    rows,
                )
        if doc["status"] == "draft":
            await conn.execute("UPDATE documents SET status = 'in_review', updated_at = now() WHERE id = %s", (doc["id"],))
    return len(rows)
