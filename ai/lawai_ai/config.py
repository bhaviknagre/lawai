"""Settings, read from the environment. Locally the repo-root .env is shared with Next.js."""

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")  # never overrides real env vars (Vercel, Docker)


def env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


# ─── LLM ────────────────────────────────────────────────────────────────
# "anthropic" (production) | "groq" (local testing)
PROVIDER = "groq" if env("LLM_PROVIDER") == "groq" else "anthropic"

if PROVIDER == "groq":
    MODELS = {
        "chat": env("GROQ_MODEL_CHAT", "openai/gpt-oss-120b"),
        "fast": env("GROQ_MODEL_FAST", "openai/gpt-oss-20b"),
    }
else:
    MODELS = {
        "chat": env("ANTHROPIC_MODEL_CHAT", "claude-sonnet-5-5"),
        "fast": env("ANTHROPIC_MODEL_FAST", "claude-haiku-4-5-20251001"),
    }


def ai_enabled() -> bool:
    return bool(env("GROQ_API_KEY") if PROVIDER == "groq" else env("ANTHROPIC_API_KEY"))


def contextual_enabled() -> bool:
    return ai_enabled() and env("RAG_CONTEXTUAL", "true") != "false"


# ─── Embeddings ─────────────────────────────────────────────────────────
EMBEDDING_DIMS = int(env("EMBEDDING_DIMENSIONS", "1024"))


def embedding_provider() -> str:
    """voyage | openai | none. Falls back to none when the provider's key is missing."""
    p = env("EMBEDDING_PROVIDER", "voyage")
    if p == "voyage" and not env("VOYAGE_API_KEY"):
        return "none"
    if p == "openai" and not env("OPENAI_API_KEY"):
        return "none"
    return p if p in ("voyage", "openai") else "none"
