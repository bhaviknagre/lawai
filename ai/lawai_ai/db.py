"""Async Postgres access. Next.js (Drizzle) owns the schema and migrations; this service only reads and writes rows."""

from contextlib import asynccontextmanager
from typing import Any

from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg.types.string import TextLoader
from psycopg_pool import AsyncConnectionPool

from .config import env

_pool: AsyncConnectionPool | None = None


async def _configure(conn: AsyncConnection) -> None:
    # uuid columns come back as plain strings, matching what Next.js sends and expects.
    conn.adapters.register_loader("uuid", TextLoader)


async def pool() -> AsyncConnectionPool:
    global _pool
    if _pool is None:
        url = env("DATABASE_URL")
        if not url:
            raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env.")
        _pool = AsyncConnectionPool(
            url,
            min_size=1,
            max_size=int(env("DB_POOL_MAX", "5")),
            open=False,
            configure=_configure,
            # prepare_threshold=None: required for PgBouncer / Supabase / Neon pooled URLs.
            kwargs={"row_factory": dict_row, "prepare_threshold": None, "autocommit": True},
        )
        await _pool.open()
    return _pool


async def fetch(sql: str, params: list | tuple = ()) -> list[dict[str, Any]]:
    async with (await pool()).connection() as conn:
        cur = await conn.execute(sql, params)
        return await cur.fetchall()


async def fetchrow(sql: str, params: list | tuple = ()) -> dict[str, Any] | None:
    rows = await fetch(sql, params)
    return rows[0] if rows else None


async def execute(sql: str, params: list | tuple = ()) -> None:
    async with (await pool()).connection() as conn:
        await conn.execute(sql, params)


@asynccontextmanager
async def transaction():
    async with (await pool()).connection() as conn:
        async with conn.transaction():
            yield conn


class Where:
    """Accumulates AND-ed SQL fragments and their parameters."""

    def __init__(self) -> None:
        self.parts: list[str] = []
        self.params: list[Any] = []

    def add(self, sql: str, *params: Any) -> "Where":
        self.parts.append(sql)
        self.params.extend(params)
        return self

    def sql(self) -> str:
        return " AND ".join(f"({p})" for p in self.parts) or "TRUE"


async def log_usage(*, firm_id: str, user_id: str | None, feature: str, model: str, input_tokens: int, output_tokens: int) -> None:
    try:
        await execute(
            "INSERT INTO ai_usage (firm_id, user_id, feature, model, input_tokens, output_tokens) VALUES (%s, %s, %s, %s, %s, %s)",
            (firm_id, user_id, feature, model, input_tokens, output_tokens),
        )
    except Exception as e:  # usage logging must never break a feature
        print(f"[ai_usage] failed to log: {e}")
