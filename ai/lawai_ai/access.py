"""
Matter-level access control (mirrors src/lib/access.ts).
Admins see every matter in their firm; everyone else only matters they're staffed on.
Next.js passes only a user id; the user and their accessible matters are re-derived here from the database,
so the AI layer never trusts a permission list it was handed.
"""

from dataclasses import dataclass, field

from . import db
from .db import Where

NIL_UUID = "00000000-0000-0000-0000-000000000000"


@dataclass
class SessionUser:
    id: str
    firm_id: str
    firm_name: str
    firm_jurisdictions: list[str]
    name: str
    role: str
    title: str
    case_ids: list[str] = field(default_factory=list)


async def load_user(user_id: str) -> SessionUser | None:
    row = await db.fetchrow(
        """SELECT u.id, u.firm_id, u.name, u.role, u.title, f.name AS firm_name, f.jurisdictions AS firm_jurisdictions
           FROM users u JOIN firms f ON f.id = u.firm_id WHERE u.id = %s""",
        (user_id,),
    )
    if not row:
        return None
    user = SessionUser(
        id=row["id"],
        firm_id=row["firm_id"],
        firm_name=row["firm_name"],
        firm_jurisdictions=list(row["firm_jurisdictions"] or []),
        name=row["name"],
        role=row["role"],
        title=row["title"],
    )
    user.case_ids = await accessible_case_ids(user)
    return user


async def accessible_case_ids(user: SessionUser) -> list[str]:
    if user.role == "admin":
        rows = await db.fetch("SELECT id FROM cases WHERE firm_id = %s", (user.firm_id,))
    else:
        rows = await db.fetch(
            """SELECT cm.case_id AS id FROM case_members cm JOIN cases c ON c.id = cm.case_id
               WHERE cm.user_id = %s AND c.firm_id = %s""",
            (user.id, user.firm_id),
        )
    return [r["id"] for r in rows]


def case_scope(w: Where, column: str, ids: list[str]) -> Where:
    """Nullable case_id: firm-wide rows OR rows on an accessible matter."""
    if not ids:
        return w.add(f"{column} IS NULL")
    return w.add(f"{column} IS NULL OR {column} = ANY(%s::uuid[])", ids)


def case_in(w: Where, column: str, ids: list[str]) -> Where:
    """Required case_id: only accessible matters."""
    return w.add(f"{column} = ANY(%s::uuid[])", ids or [NIL_UUID])
