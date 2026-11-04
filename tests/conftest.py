import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

import pe.agents  # noqa: F401  registers job handlers
from pe import admin as admin_mod
from pe import approvals, buybox, sources
from pe.db import connect

FIX = Path(__file__).parent / "fixtures"

TEST_BUY_BOX = {
    "industries": ["HVAC", "Plumbing", "Electrical"],
    "states": ["NJ", "NY", "PA"],
    "revenue_min": 1_500_000, "revenue_max": 10_000_000,
    "ebitda_min": 400_000, "ebitda_margin_min": 0.12,
    "asking_multiple_max": 5.5, "years_in_business_min": 10,
    "max_listing_age_days": 120,
    "model_assumptions": {"debt_pct": 0.7, "interest_rate": 0.10, "ebitda_growth": 0.03,
                          "exit_multiple": 5.0, "hold_years": 5, "capex_pct_of_ebitda": 0.05, "tax_rate": 0.25},
}


def load_fixture(name):
    text = (FIX / name).read_text()

    def sub(m):
        return (datetime.now(timezone.utc) - timedelta(days=int(m.group(1)))).isoformat(timespec="seconds")
    return json.loads(re.sub(r"\{\{days_ago:(\d+)\}\}", sub, text))


@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "pe.sqlite")


@pytest.fixture
def conn(db_path):
    return connect(db_path)


@pytest.fixture
def admin(conn):
    secret = admin_mod.init_admin(conn, "karan")
    return admin_mod.authenticate(conn, secret)


@pytest.fixture
def setup(conn, admin):
    buybox.set_buy_box(conn, admin, TEST_BUY_BOX, label="TEST", note="Placeholder until the real buy box is supplied")
    sources.register("source_a", lambda p: load_fixture("source_a.json"))
    sources.register("source_b", lambda p: load_fixture("source_b.json"))
    sources.approve_source(conn, admin, "source_a", "Fixture data")
    sources.approve_source(conn, admin, "source_b", "Fixture data")
    approvals.set_budget(conn, admin, "model", 50.0, auto_approve=True)
    return conn
