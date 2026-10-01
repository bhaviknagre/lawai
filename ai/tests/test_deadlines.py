from datetime import date

from lawai_ai.agent.deadlines import add_months, compute_deadline

RULE = {"amount": 20, "unit": "days", "roll_forward": True, "trigger": "Summons Served", "citation": "CPLR 320(a)"}


def test_rolls_weekend_forward():
    out = compute_deadline(RULE, date(2026, 9, 22))  # +20 days = Mon 12 Oct
    assert out["due"] == date(2026, 10, 12)
    out = compute_deadline(RULE, date(2026, 9, 20))  # +20 days = Sat 10 Oct -> Mon 12 Oct
    assert out["due"] == date(2026, 10, 12)
    assert out["due_label"] == "Mon 12 Oct 2026"
    assert "moved to the next weekday" in out["explanation"]


def test_add_months_clamps_like_date_fns():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2026, 11, 15), 3) == date(2027, 2, 15)
