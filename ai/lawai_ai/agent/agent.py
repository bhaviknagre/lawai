"""The assistant: a tool-using loop over the firm's data, streaming events back to Next.js."""

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Callable, Literal

from .. import llm
from ..access import SessionUser
from ..config import MODELS
from .tools import TOOLS, SourceRegistry, ToolContext, iso, tool_definitions

Mode = Literal["chat", "draft", "research"]
MAX_STEPS = 8
FULLWIDTH_BRACKETS = str.maketrans({"【": "[", "】": "]"})


def _json_default(o: Any) -> Any:
    if isinstance(o, datetime):
        return iso(o)
    if isinstance(o, date):
        return o.isoformat()
    if isinstance(o, Decimal):
        return float(o)
    return str(o)


def to_json(value: Any) -> str:
    return json.dumps(value, default=_json_default, ensure_ascii=False)


def system_prompt(user: SessionUser, mode: Mode, scope: dict[str, str | None]) -> str:
    today = date.today()
    lines = [
        f"You are LawAI, the AI assistant inside {user.firm_name}'s practice-management workspace.",
        f"You are speaking with {user.name} ({user.title}, role: {user.role}).",
        # Date only (no clock time): the system prompt is prompt-cached, and a per-minute timestamp would bust the cache on every call.
        f"Today is {today:%A} {today.day} {today:%B %Y} ({today.isoformat()}). Tools return exact times; use them for anything time-sensitive.",
        f"Firm jurisdictions: {', '.join(user.firm_jurisdictions) or 'not set'}.",
        "",
        "## How to work",
        "- Questions about the user's own matters, hearings, deadlines, tasks, clients or documents MUST be answered from tools. Never guess a date, name, amount or clause — look it up.",
        "- Chain tools when needed: e.g. find_cases to resolve a matter name to its id, then get_case or search_documents with that id.",
        "- For 'next hearing' style questions use get_schedule, sort by start time, and give weekday, date, time, location and judge when available.",
        "- For document questions use search_documents and quote the operative words briefly when precision matters.",
        "- For legal questions use search_legal_sources and state the jurisdiction for each point.",
        "- If tools return nothing, say plainly that you couldn't find it in the workspace and suggest where to look. Do not fill gaps from general knowledge without saying so.",
        "",
        "## Citations",
        "Every tool result item carries a `ref` like S3. Cite the supporting ref inline in square brackets right after the claim, e.g. “The hearing is on Wed 7 Oct at 9:30 AM [S2].” Cite only refs you actually used.",
        "",
        "## Style",
        "- Lead with the direct answer in one sentence, then supporting detail. Use short paragraphs and lists; use markdown tables only for comparisons.",
        "- Plain English. Name dates as 'Wed 7 Oct 2026'. Mention the timezone if the matter is in another jurisdiction.",
        "- You provide legal information and drafting support to qualified professionals, not final legal advice. Flag uncertainty and anything that needs a lawyer's judgment, but don't pad answers with disclaimers.",
    ]
    if mode == "draft":
        lines += [
            "",
            "## Mode: Draft",
            "The user wants written output (clause, email, letter, memo). Gather facts with tools first, then produce clean, ready-to-use text in a fenced block or clearly separated section. Use defined terms consistently and mark any missing facts as [PLACEHOLDER].",
        ]
    if mode == "research":
        lines += [
            "",
            "## Mode: Research",
            "Prioritise search_legal_sources. Structure the answer by jurisdiction, cite every authority, and separate settled law from open questions.",
        ]
    if scope.get("case_id"):
        lines += ["", "## Scope", f'This conversation is scoped to the matter "{scope.get("case_title")}" (case_id {scope["case_id"]}). Default all lookups to it.']
    if scope.get("document_id"):
        lines += ["", "## Scope", f'This conversation is about the document "{scope.get("document_title")}" (document_id {scope["document_id"]}). Default searches to it.']
    return "\n".join(lines)


async def run_agent(
    *,
    user: SessionUser,
    mode: Mode,
    scope: dict[str, str | None],
    history: list[dict[str, str]],
    send: Callable[[dict[str, Any]], None],
) -> dict[str, Any]:
    ctx = ToolContext(user=user, scope=scope, sources=SourceRegistry())
    messages: list[dict[str, Any]] = [{"role": m["role"], "content": m["content"]} for m in history]
    tool_calls: list[dict[str, Any]] = []
    usage = {"input_tokens": 0, "output_tokens": 0}
    text = ""
    system = system_prompt(user, mode, scope)

    def on_text(delta: str) -> None:
        nonlocal text
        # Some open models cite as 【S1】; normalise to [S1] so citations link up.
        delta = delta.translate(FULLWIDTH_BRACKETS)
        text += delta
        send({"type": "text", "delta": delta})

    for step in range(MAX_STEPS):
        res = await llm.complete(
            model=MODELS["chat"],
            max_tokens=4096,
            system=system,
            cache_system=True,
            tools=tool_definitions(),
            tools_off=step == MAX_STEPS - 1,  # last step: answer with what was gathered
            messages=messages,
            on_text=on_text,
        )
        usage["input_tokens"] += res.input_tokens
        usage["output_tokens"] += res.output_tokens
        if res.stop != "tool_use" or not res.tool_calls:
            break

        messages.append({"role": "assistant", "content": res.text, "tool_calls": res.tool_calls})
        results = []
        for call in res.tool_calls:
            spec = TOOLS.get(call.name)
            tool_calls.append({"name": call.name, "input": call.input})
            send({"type": "tool", "name": call.name, "label": spec.label(call.input) if spec else call.name})
            try:
                out = await spec.run(call.input, ctx) if spec else {"error": f"Unknown tool {call.name}"}
                results.append({"id": call.id, "content": to_json(out)[:60_000]})
            except Exception as e:
                print(f"[tool:{call.name}] {e!r}")
                results.append({"id": call.id, "content": str(e), "is_error": True})
        messages.append({"role": "tool_results", "results": results})
        if text and not text.endswith("\n"):
            text += "\n\n"
            send({"type": "text", "delta": "\n\n"})

    return {"text": text.strip(), "sources": ctx.sources.cited(text), "toolCalls": tool_calls, "usage": usage}
