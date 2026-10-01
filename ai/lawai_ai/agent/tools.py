"""
Tools the assistant can call. Each one:
 - runs a permission-scoped query (firm + accessible matters only),
 - returns compact JSON for the model,
 - registers citable sources with short refs (S1, S2…) the model cites inline as [S1].
"""

import asyncio
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from email.utils import format_datetime
from typing import Any, Awaitable, Callable
from urllib.parse import quote

from .. import db
from ..access import SessionUser, case_in, case_scope
from ..db import Where
from ..llm import Tool
from ..rag.search import search_documents, search_legal_sources
from .deadlines import compute_deadline


class SourceRegistry:
    def __init__(self) -> None:
        self.items: dict[str, dict[str, Any]] = {}
        self.by_key: dict[str, str] = {}

    def add(self, key: str, **source: Any) -> str:
        if key in self.by_key:
            return self.by_key[key]
        ref = f"S{len(self.items) + 1}"
        self.items[ref] = {"ref": ref, **{k: v for k, v in source.items() if v is not None}}
        self.by_key[key] = ref
        return ref

    def cited(self, text: str) -> list[dict[str, Any]]:
        """Sources the answer actually cites."""
        refs = set(re.findall(r"\[(S\d+)[^\]]*\]", text))
        return [s for ref, s in self.items.items() if ref in refs]


@dataclass
class ToolContext:
    user: SessionUser
    scope: dict[str, str | None]  # case_id, document_id
    sources: SourceRegistry = field(default_factory=SourceRegistry)

    @property
    def case_ids(self) -> list[str]:
        return self.user.case_ids


@dataclass
class ToolSpec:
    tool: Tool
    label: Callable[[dict[str, Any]], str]
    run: Callable[[dict[str, Any], ToolContext], Awaitable[Any]]


def iso(d: datetime | None) -> str | None:
    if d is None:
        return None
    return d.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def truncate(s: str | None, n: int) -> str | None:
    return s[:n] + "…" if s and len(s) > n else s


def now() -> datetime:
    return datetime.now(timezone.utc)


def parse_day(s: str) -> date:
    return date.fromisoformat(s[:10])


def case_filter(w: Where, ctx: ToolContext, column: str, explicit: str | None = None) -> Where:
    target = explicit or ctx.scope.get("case_id")
    if target:
        return w.add("FALSE") if target not in ctx.case_ids else w.add(f"{column} = %s", target)
    return case_scope(w, column, ctx.case_ids)


TOOLS: dict[str, ToolSpec] = {}


def tool(name: str, description: str, input_schema: dict[str, Any], label: Callable[[dict[str, Any]], str]):
    def register(fn: Callable[[dict[str, Any], ToolContext], Awaitable[Any]]):
        TOOLS[name] = ToolSpec(Tool(name, description, {"type": "object", **input_schema}), label, fn)
        return fn

    return register


# ─── search_documents ───────────────────────────────────────────────────
@tool(
    "search_documents",
    "Semantic + keyword search over the full text of the firm's documents (contracts, pleadings, evidence, correspondence, drafts). Use for any question about what a document says. Returns the most relevant passages with document title, clause heading and page.",
    {
        "properties": {
            "query": {"type": "string", "description": "What to look for, phrased as a search query. Include clause numbers or defined terms if known."},
            "case_id": {"type": "string", "description": "Restrict to one matter (uuid)."},
            "document_id": {"type": "string", "description": "Restrict to one document (uuid)."},
            "top_k": {"type": "integer", "minimum": 1, "maximum": 15},
        },
        "required": ["query"],
    },
    lambda i: f"Searching documents for “{i.get('query', '')}”",
)
async def _search_documents(i, ctx):
    hits = await search_documents(
        firm_id=ctx.user.firm_id,
        case_ids=ctx.case_ids,
        query=str(i.get("query", "")),
        case_id=i.get("case_id") or ctx.scope.get("case_id"),
        document_id=i.get("document_id") or ctx.scope.get("document_id"),
        top_k=int(i.get("top_k") or 8),
    )
    if not hits:
        return {"results": [], "note": "No matching passages in documents you can access."}
    return {
        "results": [
            {
                "ref": ctx.sources.add(
                    f"chunk:{h['id']}",
                    kind="document",
                    title=h["documentTitle"],
                    subtitle=" · ".join(x for x in (h["heading"], f"p. {h['pageNumber']}" if h["pageNumber"] else None, h["caseTitle"]) if x),
                    href=f"/documents/{h['documentId']}",
                    snippet=truncate(h["content"], 280),
                ),
                "document": h["documentTitle"],
                "document_id": h["documentId"],
                "matter": h["caseTitle"],
                "heading": h["heading"],
                "page": h["pageNumber"],
                "text": h["content"],
            }
            for h in hits
        ]
    }


# ─── get_schedule ───────────────────────────────────────────────────────
@tool(
    "get_schedule",
    "Hearings, deadlines, meetings and internal events in a date range, plus tasks due in that range. Use for 'when is my next hearing', 'what's due this week', 'what's on Friday'. Defaults to the next 30 days from now.",
    {
        "properties": {
            "from": {"type": "string", "description": "ISO date (YYYY-MM-DD). Default today."},
            "to": {"type": "string", "description": "ISO date (YYYY-MM-DD). Default 30 days from today."},
            "types": {"type": "array", "items": {"type": "string", "enum": ["hearing", "deadline", "meeting", "internal"]}},
            "case_id": {"type": "string"},
            "include_tasks": {"type": "boolean", "description": "Default true."},
            "only_mine": {"type": "boolean", "description": "Only matters the user is staffed on and tasks assigned to them."},
        }
    },
    lambda i: "Checking your calendar",
)
async def _get_schedule(i, ctx):
    start = datetime.combine(parse_day(i["from"]), time.min, timezone.utc) if i.get("from") else now()
    end = datetime.combine(parse_day(i["to"]), time.max, timezone.utc) if i.get("to") else start + timedelta(days=30)
    ids = ctx.case_ids
    if i.get("only_mine"):
        mine = {r["case_id"] for r in await db.fetch("SELECT case_id FROM case_members WHERE user_id = %s", (ctx.user.id,))}
        ids = [x for x in ids if x in mine]

    w = Where().add("e.firm_id = %s", ctx.user.firm_id).add("e.starts_at >= %s", start).add("e.starts_at <= %s", end)
    if i.get("case_id") or ctx.scope.get("case_id"):
        case_filter(w, ctx, "e.case_id", i.get("case_id"))
    else:
        case_scope(w, "e.case_id", ids)
    if i.get("types"):
        w.add("e.type::text = ANY(%s)", list(i["types"]))
    events = await db.fetch(
        f"""SELECT e.*, c.title AS case_title, c.case_number FROM events e LEFT JOIN cases c ON c.id = e.case_id
            WHERE {w.sql()} ORDER BY e.starts_at LIMIT 40""",
        w.params,
    )

    due: list[dict[str, Any]] = []
    if i.get("include_tasks") is not False:
        tw = Where().add("t.firm_id = %s", ctx.user.firm_id).add("t.status = 'open'").add("t.due_at <= %s", end)
        tw.add("t.due_at >= %s", start - timedelta(days=60))  # include overdue
        case_filter(tw, ctx, "t.case_id", i.get("case_id"))
        if i.get("only_mine"):
            tw.add("t.assignee_id = %s", ctx.user.id)
        due = await db.fetch(
            f"SELECT t.*, c.title AS case_title FROM tasks t LEFT JOIN cases c ON c.id = t.case_id WHERE {tw.sql()} ORDER BY t.due_at LIMIT 40",
            tw.params,
        )

    current = now()
    return {
        "now": iso(current),
        "range": {"from": iso(start), "to": iso(end)},
        "events": [
            {
                "ref": ctx.sources.add(
                    f"event:{e['id']}",
                    kind="event",
                    title=e["title"],
                    subtitle=" · ".join(x for x in (e["case_title"], format_datetime(e["starts_at"].astimezone(timezone.utc), usegmt=True)) if x),
                    href=f"/cases/{e['case_id']}" if e["case_id"] else "/tasks",
                ),
                "title": e["title"],
                "type": e["type"],
                "starts_at": iso(e["starts_at"]),
                "all_day": e["all_day"],
                "location": e["location"],
                "judge": e["judge"],
                "notes": e["notes"],
                "matter": e["case_title"],
                "case_number": e["case_number"],
                "case_id": e["case_id"],
            }
            for e in events
        ],
        "tasks_due": [
            {
                "ref": ctx.sources.add(f"task:{t['id']}", kind="task", title=t["title"], subtitle=t["case_title"] or "Firm task", href="/tasks"),
                "title": t["title"],
                "due_at": iso(t["due_at"]),
                "overdue": bool(t["due_at"] and t["due_at"] < current),
                "priority": t["priority"],
                "matter": t["case_title"],
            }
            for t in due
        ],
    }


# ─── list_tasks ─────────────────────────────────────────────────────────
@tool(
    "list_tasks",
    "List tasks with filters. Use for workload questions: overdue work, tasks on a matter, what is assigned to me.",
    {
        "properties": {
            "status": {"type": "string", "enum": ["open", "done", "all"]},
            "case_id": {"type": "string"},
            "assigned_to_me": {"type": "boolean"},
            "overdue_only": {"type": "boolean"},
        }
    },
    lambda i: "Looking at tasks",
)
async def _list_tasks(i, ctx):
    w = Where().add("t.firm_id = %s", ctx.user.firm_id)
    case_filter(w, ctx, "t.case_id", i.get("case_id"))
    if i.get("status") != "all":
        w.add("t.status = %s", "done" if i.get("status") == "done" else "open")
    if i.get("assigned_to_me"):
        w.add("t.assignee_id = %s", ctx.user.id)
    if i.get("overdue_only"):
        w.add("t.due_at <= %s", now())
    rows = await db.fetch(
        f"""SELECT t.*, c.title AS case_title, u.name AS assignee FROM tasks t
            LEFT JOIN cases c ON c.id = t.case_id LEFT JOIN users u ON u.id = t.assignee_id
            WHERE {w.sql()} ORDER BY t.due_at LIMIT 50""",
        w.params,
    )
    return [
        {
            "ref": ctx.sources.add(f"task:{t['id']}", kind="task", title=t["title"], subtitle=t["case_title"] or "Firm task", href="/tasks"),
            "title": t["title"],
            "status": t["status"],
            "priority": t["priority"],
            "due_at": iso(t["due_at"]),
            "assignee": t["assignee"],
            "matter": t["case_title"],
        }
        for t in rows
    ]


# ─── find_cases ─────────────────────────────────────────────────────────
@tool(
    "find_cases",
    "Find matters by name, case number, client, opposing party or practice area. Returns ids to use with other tools.",
    {
        "properties": {
            "query": {"type": "string"},
            "status": {"type": "string", "enum": ["active", "on_hold", "closed", "all"]},
            "priority": {"type": "string", "enum": ["high", "medium", "low"]},
        }
    },
    lambda i: f"Finding matters matching “{i['query']}”" if i.get("query") else "Listing matters",
)
async def _find_cases(i, ctx):
    w = Where().add("c.firm_id = %s", ctx.user.firm_id)
    case_in(w, "c.id", ctx.case_ids)
    if i.get("status") and i["status"] != "all":
        w.add("c.status = %s", i["status"])
    elif not i.get("status"):
        w.add("c.status <> 'closed'")
    if i.get("priority"):
        w.add("c.priority = %s", i["priority"])
    if i.get("query"):
        q = f"%{i['query']}%"
        w.add("c.title ILIKE %s OR c.case_number ILIKE %s OR cl.name ILIKE %s OR c.opposing_party ILIKE %s OR c.practice_area ILIKE %s", q, q, q, q, q)
    rows = await db.fetch(
        f"SELECT c.*, cl.name AS client FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE {w.sql()} ORDER BY c.updated_at DESC LIMIT 25",
        w.params,
    )
    return [
        {
            "ref": ctx.sources.add(f"case:{c['id']}", kind="case", title=c["title"], subtitle=c["case_number"], href=f"/cases/{c['id']}"),
            "case_id": c["id"],
            "title": c["title"],
            "case_number": c["case_number"],
            "client": c["client"],
            "practice_area": c["practice_area"],
            "jurisdiction": c["jurisdiction"],
            "stage": c["stage"],
            "priority": c["priority"],
            "status": c["status"],
        }
        for c in rows
    ]


# ─── get_case ───────────────────────────────────────────────────────────
@tool(
    "get_case",
    "Full matter file: client, court, opposing party and counsel, team, upcoming events, open tasks, documents and recent activity.",
    {"properties": {"case_id": {"type": "string"}}, "required": ["case_id"]},
    lambda i: "Opening the matter file",
)
async def _get_case(i, ctx):
    case_id = i.get("case_id")
    if case_id not in ctx.case_ids:
        return {"error": "Matter not found or you don't have access."}
    c = await db.fetchrow(
        """SELECT c.*, cl.id AS client_id, cl.name AS client_name, cl.primary_contact, cl.email AS client_email, j.name AS jurisdiction_name
           FROM cases c JOIN clients cl ON cl.id = c.client_id JOIN jurisdictions j ON j.code = c.jurisdiction WHERE c.id = %s""",
        (case_id,),
    )
    if not c:
        return {"error": "Matter not found."}
    team, events, open_tasks, docs, activity = await asyncio.gather(
        db.fetch("SELECT u.name, u.title, cm.role FROM case_members cm JOIN users u ON u.id = cm.user_id WHERE cm.case_id = %s", (case_id,)),
        db.fetch("SELECT * FROM events WHERE case_id = %s AND starts_at >= %s ORDER BY starts_at LIMIT 10", (case_id, now() - timedelta(days=1))),
        db.fetch("SELECT * FROM tasks WHERE case_id = %s AND status = 'open' ORDER BY due_at LIMIT 15", (case_id,)),
        db.fetch("SELECT id, title, kind, status, summary FROM documents WHERE case_id = %s ORDER BY updated_at DESC LIMIT 25", (case_id,)),
        db.fetch("SELECT description, created_at FROM activities WHERE case_id = %s ORDER BY created_at DESC LIMIT 8", (case_id,)),
    )
    return {
        "ref": ctx.sources.add(f"case:{c['id']}", kind="case", title=c["title"], subtitle=c["case_number"], href=f"/cases/{c['id']}"),
        "case_id": c["id"],
        "title": c["title"],
        "case_number": c["case_number"],
        "practice_area": c["practice_area"],
        "jurisdiction": c["jurisdiction_name"],
        "court": c["court"],
        "stage": c["stage"],
        "priority": c["priority"],
        "status": c["status"],
        "opened": c["opened_at"],
        "description": c["description"],
        "client": {"id": c["client_id"], "name": c["client_name"], "contact": c["primary_contact"], "email": c["client_email"]},
        "opposing_party": c["opposing_party"],
        "opposing_counsel": c["opposing_counsel"],
        "team": team,
        "upcoming_events": [
            {
                "ref": ctx.sources.add(f"event:{e['id']}", kind="event", title=e["title"], subtitle=c["title"], href=f"/cases/{c['id']}"),
                "title": e["title"],
                "type": e["type"],
                "starts_at": iso(e["starts_at"]),
                "location": e["location"],
                "judge": e["judge"],
                "notes": e["notes"],
            }
            for e in events
        ],
        "open_tasks": [{"title": t["title"], "due_at": iso(t["due_at"]), "priority": t["priority"]} for t in open_tasks],
        "documents": [{**d, "summary": truncate(d["summary"], 200)} for d in docs],
        "recent_activity": [{"what": a["description"], "when": iso(a["created_at"])} for a in activity],
    }


# ─── find_clients / get_client ──────────────────────────────────────────
@tool(
    "find_clients",
    "Find clients by name, contact person, email or location.",
    {"properties": {"query": {"type": "string"}}},
    lambda i: f"Finding client “{i['query']}”" if i.get("query") else "Listing clients",
)
async def _find_clients(i, ctx):
    w = Where().add("firm_id = %s", ctx.user.firm_id)
    if i.get("query"):
        q = f"%{i['query']}%"
        w.add("name ILIKE %s OR primary_contact ILIKE %s OR email ILIKE %s OR location ILIKE %s", q, q, q, q)
    rows = await db.fetch(f"SELECT * FROM clients WHERE {w.sql()} ORDER BY name LIMIT 25", w.params)
    return [
        {
            "ref": ctx.sources.add(f"client:{c['id']}", kind="client", title=c["name"], subtitle=c["location"], href=f"/clients/{c['id']}"),
            "client_id": c["id"],
            "name": c["name"],
            "type": c["type"],
            "location": c["location"],
            "primary_contact": c["primary_contact"],
        }
        for c in rows
    ]


@tool(
    "get_client",
    "Client profile: contacts, billing, conflict check, matters and recent activity (calls, emails, uploads).",
    {"properties": {"client_id": {"type": "string"}}, "required": ["client_id"]},
    lambda i: "Opening the client file",
)
async def _get_client(i, ctx):
    c = await db.fetchrow("SELECT * FROM clients WHERE id = %s AND firm_id = %s", (i.get("client_id"), ctx.user.firm_id))
    if not c:
        return {"error": "Client not found."}
    mw = Where().add("client_id = %s", c["id"])
    case_in(mw, "id", ctx.case_ids)
    matters, activity = await asyncio.gather(
        db.fetch(f"SELECT id, title, case_number AS number, status, stage FROM cases WHERE {mw.sql()}", mw.params),
        db.fetch("SELECT description, created_at FROM activities WHERE client_id = %s ORDER BY created_at DESC LIMIT 10", (c["id"],)),
    )
    return {
        "ref": ctx.sources.add(f"client:{c['id']}", kind="client", title=c["name"], subtitle=c["location"], href=f"/clients/{c['id']}"),
        **c,
        "matters": matters,
        "recent_activity": [{"what": a["description"], "when": iso(a["created_at"])} for a in activity],
    }


# ─── get_document_issues ────────────────────────────────────────────────
@tool(
    "get_document_issues",
    "Issues found by AI contract review (risk flags vs. the firm playbook), for one document or a matter.",
    {
        "properties": {
            "document_id": {"type": "string"},
            "case_id": {"type": "string"},
            "status": {"type": "string", "enum": ["open", "accepted", "dismissed", "all"]},
        }
    },
    lambda i: "Checking review findings",
)
async def _get_document_issues(i, ctx):
    w = Where().add("di.firm_id = %s", ctx.user.firm_id)
    case_filter(w, ctx, "d.case_id", i.get("case_id"))
    doc_id = i.get("document_id") or ctx.scope.get("document_id")
    if doc_id:
        w.add("di.document_id = %s", doc_id)
    if i.get("status") != "all":
        w.add("di.status = %s", i.get("status") or "open")
    rows = await db.fetch(
        f"SELECT di.*, d.title AS doc FROM document_issues di JOIN documents d ON d.id = di.document_id WHERE {w.sql()} LIMIT 40",
        w.params,
    )
    return [
        {
            "ref": ctx.sources.add(
                f"issue:{x['id']}", kind="document", title=x["doc"], subtitle=f"{x['clause_ref'] or ''} · {x['title']}", href=f"/documents/{x['document_id']}"
            ),
            "document": x["doc"],
            "severity": x["severity"],
            "clause": x["clause_ref"],
            "title": x["title"],
            "explanation": x["explanation"],
            "status": x["status"],
        }
        for x in rows
    ]


# ─── search_legal_sources ───────────────────────────────────────────────
@tool(
    "search_legal_sources",
    "Search the legal research library (case law, statutes, regulations, commentary). Filter by jurisdiction codes: US-FED, US-NY, US-CA, UK-EW, IN, IN-MH, SG, EU.",
    {
        "properties": {"query": {"type": "string"}, "jurisdictions": {"type": "array", "items": {"type": "string"}}},
        "required": ["query"],
    },
    lambda i: f"Researching “{i.get('query', '')}”",
)
async def _search_legal_sources(i, ctx):
    hits = await search_legal_sources(query=str(i.get("query", "")), jurisdictions=i.get("jurisdictions"), top_k=6)
    return [
        {
            "ref": ctx.sources.add(
                f"legal:{h['id']}",
                kind="legal",
                title=h["title"],
                subtitle=f"{h['citation']} · {h['jurisdiction']}",
                href=f"/research?q={quote(h['title'])}",
                snippet=h["summary"],
            ),
            "title": h["title"],
            "citation": h["citation"],
            "court": h["court"],
            "jurisdiction": h["jurisdiction"],
            "type": h["sourceType"],
            "summary": h["summary"],
            "text": truncate(h["content"], 1500),
        }
        for h in hits
    ]


# ─── calculate_deadline ─────────────────────────────────────────────────
@tool(
    "calculate_deadline",
    "Compute a procedural deadline from a trigger date using the firm's court-rules table. Call without rule_id to list available rules (optionally filtered by `search`), then call again with rule_id.",
    {
        "properties": {
            "rule_id": {"type": "string"},
            "search": {"type": "string", "description": "e.g. 'answer New York', 'defence', 'appeal'"},
            "trigger_date": {"type": "string", "description": "ISO date YYYY-MM-DD"},
        }
    },
    lambda i: "Calculating a deadline",
)
async def _calculate_deadline(i, ctx):
    if not i.get("rule_id"):
        # Every word must appear somewhere in the rule (set, trigger, result or citation).
        w = Where()
        for word in (x for x in str(i.get("search") or "").split() if len(x) > 1):
            w.add("concat_ws(' ', rule_set, trigger, result_label, citation, jurisdiction) ILIKE %s", f"%{word}%")
        rules = await db.fetch(f"SELECT * FROM deadline_rules WHERE {w.sql()} LIMIT 20", w.params)
        return {
            "rules": [
                {"rule_id": r["id"], "rule_set": r["rule_set"], "trigger": r["trigger"], "result": r["result_label"], "period": f"{r['amount']} {r['unit']}", "citation": r["citation"]}
                for r in rules
            ]
        }
    try:
        rule = await db.fetchrow("SELECT * FROM deadline_rules WHERE id = %s", (i["rule_id"],))
    except Exception:
        rule = None  # not a uuid
    if not rule:
        return {"error": "Unknown rule_id"}
    if not i.get("trigger_date"):
        return {"error": "trigger_date is required"}
    out = compute_deadline(rule, parse_day(i["trigger_date"]))
    return {
        "ref": ctx.sources.add(f"rule:{rule['id']}", kind="rule", title=f"{rule['rule_set']} · {rule['citation']}", subtitle=rule["trigger"], href="/tasks"),
        "result": rule["result_label"],
        "due": out["due_label"],
        "explanation": out["explanation"],
        "notes": rule["notes"],
        "caveat": "Court holidays and court orders are not applied. Verify before relying on it.",
    }


def tool_definitions() -> list[Tool]:
    return [t.tool for t in TOOLS.values()]
