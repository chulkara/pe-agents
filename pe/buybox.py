"""The user's buy box: append-only versions, writable only through the admin path.

Agents read the current version and record which version they screened against.
No agent function exists to edit it, so a deal can't be made to qualify by moving the box.
"""
import json

from .db import audit, now, tx

KNOWN_CRITERIA = {
    "industries", "states", "revenue_min", "revenue_max", "ebitda_min", "ebitda_max",
    "ebitda_margin_min", "asking_multiple_max", "years_in_business_min", "max_listing_age_days",
    "ownership_types",
}


def set_buy_box(conn, admin, criteria, label, note=""):
    """Admin only (callers must pass an authenticated Admin, see pe.admin)."""
    from .admin import Admin
    if not isinstance(admin, Admin):
        raise PermissionError("Only an authenticated admin can change the buy box")
    unknown = set(criteria) - KNOWN_CRITERIA - {"model_assumptions", "thesis"}
    if unknown:
        raise ValueError(f"Unknown criteria: {sorted(unknown)}")
    with tx(conn):
        cur = conn.execute(
            "INSERT INTO buy_box(criteria_json,label,created_by,note,created_at) VALUES (?,?,?,?,?)",
            (json.dumps(criteria, sort_keys=True), label, admin.name, note, now()),
        )
        audit(conn, admin.name, "buy_box.version", version=cur.lastrowid, label=label)
        return cur.lastrowid


def current(conn):
    row = conn.execute("SELECT * FROM buy_box ORDER BY version DESC LIMIT 1").fetchone()
    if not row:
        return None
    return {"version": row["version"], "label": row["label"], "criteria": json.loads(row["criteria_json"])}
