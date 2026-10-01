"""ASGI entrypoint (Vercel: `main:app`; local: `uvicorn main:app --reload --port 8000`)."""

from lawai_ai.api import app

__all__ = ["app"]
