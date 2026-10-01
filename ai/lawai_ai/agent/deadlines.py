"""
Compute a deadline from a trigger date (mirrors src/lib/deadlines.ts, which the UI calculator uses).
Weekends roll forward to Monday when the rule says so.
Court holidays are NOT applied — add a holidays table per jurisdiction before relying on this in production.
"""

import calendar
from datetime import date, timedelta
from typing import Any


def add_months(d: date, months: int) -> date:
    """Calendar-month add, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb), like date-fns."""
    m = d.month - 1 + months
    y, m = d.year + m // 12, m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def due_label(d: date) -> str:
    return f"{d:%a} {d.day} {d:%b %Y}"  # "Wed 7 Oct 2026"


def compute_deadline(rule: dict[str, Any], trigger: date) -> dict[str, Any]:
    due = add_months(trigger, rule["amount"]) if rule["unit"] == "months" else trigger + timedelta(days=rule["amount"])
    rolled = False
    if rule["roll_forward"]:
        while due.weekday() >= 5:
            due += timedelta(days=1)
            rolled = True
    return {
        "due": due,
        "due_label": due_label(due),
        "explanation": f"{rule['amount']} {rule['unit']} after {rule['trigger'].lower()}{', moved to the next weekday' if rolled else ''} · {rule['citation']}",
    }
