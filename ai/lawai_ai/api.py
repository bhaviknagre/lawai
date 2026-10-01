"""
HTTP API, called only by the Next.js server (never the browser).
On Vercel this service is private: it has no public route and Next.js reaches it via a service binding.
Every /v1 route still requires the shared INTERNAL_API_TOKEN, because a binding grants reachability, not authentication.
Next.js sends a user id; the user and their accessible matters are re-loaded here from the database.
"""

import asyncio
import hmac
from typing import Any, Literal

from fastapi import APIRouter, Depends, FastAPI, Header, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import db
from .access import SessionUser, load_user
from .agent.agent import run_agent, to_json
from .config import MODELS, PROVIDER, ai_enabled, contextual_enabled, embedding_provider, env
from .draft import draft_text
from .llm import AiNotConfigured
from .rag.ingest import ingest_document, ingest_pending
from .rag.search import search_documents
from .research import run_research
from .review import review_document


class ApiError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


def require_token(authorization: str | None = Header(default=None)) -> None:
    expected = env("INTERNAL_API_TOKEN")
    if not expected:
        raise ApiError(500, "INTERNAL_API_TOKEN is not set on the AI service.")
    if not authorization or not hmac.compare_digest(authorization, f"Bearer {expected}"):
        raise ApiError(401, "Unauthorized")


async def get_user(user_id: str) -> SessionUser:
    try:
        user = await load_user(user_id)
    except Exception:
        user = None  # malformed id
    if not user:
        raise ApiError(401, "Unknown user")
    return user


app = FastAPI(title="LawAI intelligence service", docs_url=None, redoc_url=None, openapi_url=None)
v1 = APIRouter(prefix="/v1", dependencies=[Depends(require_token)])


@app.exception_handler(ApiError)
async def _api_error(_: Request, e: ApiError):
    return JSONResponse({"error": str(e)}, status_code=e.status)


@app.exception_handler(AiNotConfigured)
async def _not_configured(_: Request, e: AiNotConfigured):
    return JSONResponse({"error": str(e)}, status_code=400)


@app.exception_handler(Exception)
async def _unhandled(_: Request, e: Exception):
    print(f"[api] {e!r}")
    return JSONResponse({"error": str(e) or "Something went wrong."}, status_code=500)


@app.get("/health")
async def health():
    return {"ok": True}


@v1.get("/status")
async def status():
    return {
        "ai": ai_enabled(),
        "provider": PROVIDER,
        "models": MODELS,
        "embeddings": embedding_provider(),
        "contextual": contextual_enabled(),
    }


# ─── Assistant ──────────────────────────────────────────────────────────
class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatBody(BaseModel):
    userId: str
    mode: Literal["chat", "draft", "research"] = "chat"
    caseId: str | None = None
    documentId: str | None = None
    history: list[ChatTurn]


@v1.post("/chat")
async def chat(body: ChatBody):
    """NDJSON stream: {type:"text"|"tool"} events, then one {type:"result"} (or {type:"error"})."""
    user = await get_user(body.userId)
    if body.caseId and body.caseId not in user.case_ids:
        raise ApiError(403, "No access to that matter")
    scope: dict[str, Any] = {"case_id": body.caseId, "document_id": body.documentId}
    if body.caseId:
        row = await db.fetchrow("SELECT title FROM cases WHERE id = %s", (body.caseId,))
        scope["case_title"] = row and row["title"]
    if body.documentId:
        row = await db.fetchrow("SELECT title FROM documents WHERE id = %s AND firm_id = %s", (body.documentId, user.firm_id))
        scope["document_title"] = row and row["title"]

    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    async def produce() -> None:
        try:
            result = await run_agent(user=user, mode=body.mode, scope=scope, history=[t.model_dump() for t in body.history], send=queue.put_nowait)
            await db.log_usage(firm_id=user.firm_id, user_id=user.id, feature="chat", model=MODELS["chat"], **result.pop("usage"))
            queue.put_nowait({"type": "result", **result})
        except Exception as e:
            print(f"[chat] {e!r}")
            queue.put_nowait({"type": "error", "message": str(e) or "Something went wrong."})
        finally:
            queue.put_nowait(None)

    async def stream():
        task = asyncio.create_task(produce())
        try:
            while (event := await queue.get()) is not None:
                yield to_json(event) + "\n"
        finally:
            if not task.done():
                task.cancel()  # client went away

    return StreamingResponse(stream(), media_type="application/x-ndjson")


# ─── Search / research ──────────────────────────────────────────────────
class SearchBody(BaseModel):
    userId: str
    query: str = Field(min_length=1, max_length=1000)
    caseId: str | None = None
    documentId: str | None = None
    topK: int = Field(default=8, ge=1, le=30)


@v1.post("/search")
async def search(body: SearchBody):
    user = await get_user(body.userId)
    hits = await search_documents(
        firm_id=user.firm_id, case_ids=user.case_ids, query=body.query, case_id=body.caseId, document_id=body.documentId, top_k=body.topK
    )
    return {"hits": jsonable_encoder(hits)}


class ResearchBody(BaseModel):
    userId: str
    query: str = Field(min_length=3, max_length=1000)
    jurisdictions: list[str] = []


@v1.post("/research")
async def research(body: ResearchBody):
    user = await get_user(body.userId)
    return jsonable_encoder(await run_research(firm_id=user.firm_id, user_id=user.id, query=body.query, jurisdictions=body.jurisdictions))


# ─── Review / drafting ──────────────────────────────────────────────────
class ReviewBody(BaseModel):
    userId: str
    documentId: str
    ourSide: str | None = None


@v1.post("/review")
async def review(body: ReviewBody):
    user = await get_user(body.userId)
    try:
        n = await review_document(document_id=body.documentId, firm_id=user.firm_id, user_id=user.id, our_side=body.ourSide)
    except ValueError as e:
        raise ApiError(400, str(e))
    return {"issues": n}


class DraftBody(BaseModel):
    userId: str
    instruction: str = Field(min_length=5, max_length=4000)
    tone: str | None = Field(default=None, max_length=100)
    documentId: str | None = None
    kind: Literal["clause", "document"] = "clause"


@v1.post("/draft")
async def draft(body: DraftBody):
    user = await get_user(body.userId)
    text = await draft_text(firm_id=user.firm_id, user_id=user.id, instruction=body.instruction, tone=body.tone, document_id=body.documentId, kind=body.kind)
    return {"text": text}


# ─── Ingestion ──────────────────────────────────────────────────────────
class IngestBody(BaseModel):
    documentId: str
    reparse: bool = False


@v1.post("/ingest")
async def ingest(body: IngestBody):
    try:
        return await ingest_document(body.documentId, reparse=body.reparse)
    except LookupError as e:
        raise ApiError(404, str(e))


class IngestPendingBody(BaseModel):
    limit: int = Field(default=10, ge=1, le=100)


@v1.post("/ingest/pending")
async def ingest_pending_route(body: IngestPendingBody):
    return {"processed": await ingest_pending(limit=body.limit)}


app.include_router(v1)
