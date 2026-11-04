"""Listing source adapters. Only sources an admin has approved can be searched.

Real adapters (BizBuySell, broker sites, etc.) are not built yet: each needs the site's
terms checked for automated access first. The FixtureSource reads JSON files for tests.
"""
import json
import re

from .admin import Admin
from .db import audit, tx

ADAPTERS = {}


def register(name, fn):
    ADAPTERS[name] = fn


def approve_source(conn, admin, name, terms_note):
    if not isinstance(admin, Admin):
        raise PermissionError("Only an authenticated admin can approve sources")
    row = conn.execute("SELECT value FROM settings WHERE key='approved_sources'").fetchone()
    approved = json.loads(row["value"]) if row else {}
    approved[name] = terms_note
    with tx(conn):
        conn.execute("INSERT OR REPLACE INTO settings VALUES ('approved_sources', ?)", (json.dumps(approved),))
        audit(conn, admin.name, "source.approved", source=name, terms=terms_note)


def approved_sources(conn):
    row = conn.execute("SELECT value FROM settings WHERE key='approved_sources'").fetchone()
    return json.loads(row["value"]) if row else {}


def fixture_source(path):
    """Test/demo data. {{days_ago:N}} placeholders become dates relative to today."""
    from datetime import datetime, timedelta, timezone

    def fetch(params):
        text = open(path).read()
        text = re.sub(r"\{\{days_ago:(\d+)\}\}",
                      lambda m: (datetime.now(timezone.utc) - timedelta(days=int(m.group(1)))).isoformat(timespec="seconds"), text)
        return json.loads(text)
    return fetch


_MONEY = re.compile(r"^\$?\s*([0-9][0-9,]*\.?[0-9]*)\s*([kKmM]?)$")


def parse_money(v):
    """Return a number or None. Never guesses: anything unparseable is None (unknown)."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = _MONEY.match(str(v).strip())
    if not m:
        return None
    n = float(m.group(1).replace(",", ""))
    return n * {"k": 1e3, "m": 1e6}.get(m.group(2).lower(), 1)
