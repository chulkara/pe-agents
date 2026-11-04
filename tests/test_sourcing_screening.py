import json
import threading
from datetime import datetime, timezone

import pytest

from pe import approvals, buybox, jobs, records
from pe.agents import analyst, offmarket, sourcing
from pe.db import ConflictError, connect


def deal_by_name(conn, fragment):
    return conn.execute("SELECT * FROM deals WHERE name LIKE ?", (f"%{fragment}%",)).fetchone()


def latest_screening(conn, deal_id):
    r = conn.execute("SELECT * FROM screenings WHERE deal_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1", (deal_id,)).fetchone()
    return r["overall"], {x["criterion"]: x for x in json.loads(r["results_json"])}


def run(conn, kind, params, key):
    job_id, _ = jobs.submit(conn, kind, params, key)
    return job_id, jobs.run(conn, job_id)


def test_full_slice_and_duplicates(setup):
    conn = setup
    _, st = run(conn, "sourcing.run", {"sources": ["source_a"]}, "adhoc:a:1")
    assert st == "succeeded"
    # 8 rows in the file, one an exact duplicate delivery -> 7 deals
    assert conn.execute("SELECT COUNT(*) c FROM deals").fetchone()["c"] == 7
    assert conn.execute("SELECT COUNT(*) c FROM listings").fetchone()["c"] == 7

    _, st = run(conn, "analyst.screen_ready", {}, "screen:1")
    assert st == "succeeded"
    hart = deal_by_name(conn, "Hartwell")
    overall, res = latest_screening(conn, hart["deal_id"])
    assert overall == "pass" and hart["handoff_state"] == "screened_pass"
    assert all(r["evidence"] for r in res.values())
    model = json.loads(conn.execute("SELECT payload_json FROM models WHERE deal_id=?", (hart["deal_id"],)).fetchone()[0])
    assert model["built"] and "not facts" in model["assumptions"]["label"] and "not a forecast" in model["calculated"]["label"]
    assert model["reported_inputs"]["ebitda"] == 860000

    # Second source: same Hartwell (name variant) with a conflicting revenue,
    # and the anonymized electrical listing again on another broker.
    _, st = run(conn, "sourcing.run", {"sources": ["source_b"]}, "adhoc:b:1")
    assert conn.execute("SELECT COUNT(*) c FROM deals").fetchone()["c"] == 7  # no new deals
    _, st = run(conn, "analyst.screen_ready", {}, "screen:2")
    overall, res = latest_screening(conn, hart["deal_id"])
    assert overall == "unknown"
    assert res["revenue_min"]["result"] == "unknown" and "disagree" in res["revenue_min"]["evidence"]
    assert conn.execute("SELECT COUNT(*) c FROM questions WHERE deal_id=? AND text LIKE 'Which annual revenue%'",
                        (hart["deal_id"],)).fetchone()["c"] == 1
    elec = conn.execute("SELECT deal_id FROM deals WHERE normalized_key LIKE 'fp:electrical%'").fetchall()
    assert len(elec) == 1
    assert conn.execute("SELECT COUNT(*) c FROM notes WHERE deal_id=? AND body LIKE 'Possible duplicate%'",
                        (elec[0]["deal_id"],)).fetchone()["c"] == 1


def test_missing_and_sde_are_unknown_not_invented(setup):
    conn = setup
    run(conn, "sourcing.run", {"sources": ["source_a"]}, "a")
    run(conn, "analyst.screen_ready", {}, "s")
    plumb = deal_by_name(conn, "Delmar")
    overall, res = latest_screening(conn, plumb["deal_id"])
    assert overall == "unknown"
    assert res["ebitda_min"]["result"] == "unknown" and "SDE is not EBITDA" in res["ebitda_min"]["evidence"]
    assert not records.facts_for(conn, plumb["deal_id"]).get("ebitda")
    assert not conn.execute("SELECT 1 FROM models WHERE deal_id=?", (plumb["deal_id"],)).fetchone()

    keystone = deal_by_name(conn, "Keystone")
    overall, res = latest_screening(conn, keystone["deal_id"])
    assert res["revenue_min"]["result"] == "unknown"
    assert res["ebitda_margin_min"]["result"] == "unknown"

    riverside = deal_by_name(conn, "Riverside")  # revenue "call for details"
    flags = json.loads(conn.execute("SELECT flags_json FROM listings WHERE deal_id=?", (riverside["deal_id"],)).fetchone()[0])
    assert any(f["flag"] == "unparseable_financial" for f in flags)
    assert not records.facts_for(conn, riverside["deal_id"]).get("revenue")


def test_stale_source_not_screened(setup):
    conn = setup
    run(conn, "sourcing.run", {"sources": ["source_a"]}, "a")
    run(conn, "analyst.screen_ready", {}, "s")
    old = deal_by_name(conn, "Old Cached")
    assert old["handoff_state"] == "needs_refresh"
    assert not conn.execute("SELECT 1 FROM screenings WHERE deal_id=?", (old["deal_id"],)).fetchone()


def test_malicious_listing_cannot_act(setup):
    conn = setup
    run(conn, "sourcing.run", {"sources": ["source_a"]}, "a")
    run(conn, "analyst.screen_ready", {}, "s")
    bad = deal_by_name(conn, "Summit Air")
    flags = json.loads(conn.execute("SELECT flags_json FROM listings WHERE deal_id=?", (bad["deal_id"],)).fetchone()[0])
    assert flags[0]["flag"] == "untrusted_instructions_detected"
    overall, res = latest_screening(conn, bad["deal_id"])
    assert overall == "fail"  # 7.5% margin < 12%; the text asking to "mark as qualified" changed nothing
    assert conn.execute("SELECT COUNT(*) c FROM actions").fetchone()["c"] == 0
    assert buybox.current(conn)["version"] == 1


def test_interrupted_job_resumes_without_duplicates(setup, monkeypatch):
    conn = setup
    real = sourcing.log_listing
    calls = {"n": 0}

    def flaky(c, raw, max_age=None):
        calls["n"] += 1
        if calls["n"] == 4:
            raise ConnectionError("simulated crash mid-run")
        return real(c, raw, max_age)
    monkeypatch.setattr(sourcing, "log_listing", flaky)
    job_id, st = run(conn, "sourcing.run", {"sources": ["source_a"]}, "flaky")
    assert st == "retry_wait"
    done_before = len(json.loads(conn.execute("SELECT checkpoint_json FROM jobs WHERE job_id=?", (job_id,)).fetchone()[0])["done"])
    assert done_before == 3
    assert jobs.run(conn, job_id) == "succeeded"
    assert conn.execute("SELECT COUNT(*) c FROM deals").fetchone()["c"] == 7
    assert conn.execute("SELECT COUNT(*) c FROM listings").fetchone()["c"] == 7
    # A full rerun under a new key also changes nothing
    run(conn, "sourcing.run", {"sources": ["source_a"]}, "rerun")
    assert conn.execute("SELECT COUNT(*) c FROM listings").fetchone()["c"] == 7
    assert conn.execute("SELECT COUNT(*) c FROM facts").fetchone()["c"] == conn.execute("SELECT COUNT(DISTINCT dedupe_key) c FROM facts").fetchone()["c"]


def test_job_idempotency_pause_cancel_schedule(setup, admin):
    conn = setup
    j1, created1 = jobs.submit(conn, "sourcing.run", {"sources": ["source_a"]}, "same-key")
    j2, created2 = jobs.submit(conn, "sourcing.run", {"sources": ["source_a"]}, "same-key")
    assert j1 == j2 and created1 and not created2

    jobs.request(conn, j1, "pause", "karan")
    assert jobs.run(conn, j1) == "paused"
    jobs.resume(conn, j1, "karan")
    jobs.request(conn, j1, "cancel", "karan")
    assert jobs.run(conn, j1) == "cancelled"
    assert conn.execute("SELECT COUNT(*) c FROM deals").fetchone()["c"] == 0

    jobs.add_schedule(conn, admin, "daily-a", "sourcing.run", {"sources": ["source_a"]}, every_minutes=1440)
    assert len(jobs.tick(conn, 100_000)) == 1
    assert len(jobs.tick(conn, 100_001)) == 0  # same day bucket: no duplicate run


def test_unapproved_source_refused(setup):
    conn = setup
    _, st = run(conn, "sourcing.run", {"sources": ["random_site"]}, "x")
    res = json.loads(conn.execute("SELECT result_json FROM jobs WHERE idem_key='x'").fetchone()[0])
    assert res["skipped_sources"] == ["random_site"] and res["logged"] == 0


def test_concurrent_updates_conflict(setup, db_path):
    conn = setup
    run(conn, "sourcing.run", {"sources": ["source_a"]}, "a")
    d = deal_by_name(conn, "Hartwell")
    c1, c2 = connect(db_path), connect(db_path)
    v = d["version"]
    records.set_handoff(c1, "analyst", d["deal_id"], v, "needs_info")
    with pytest.raises(ConflictError):
        records.set_handoff(c2, "analyst", d["deal_id"], v, "screened_pass")
    # Parallel writers on the same deal: exactly one wins per version
    d = records.get_deal(conn, d["deal_id"])
    errors, wins = [], []

    def worker(target):
        c = connect(db_path)
        try:
            records.set_handoff(c, "analyst", d["deal_id"], d["version"], target)
            wins.append(target)
        except ConflictError as e:
            errors.append(e)
    ts = [threading.Thread(target=worker, args=(t,)) for t in ("screened_pass", "screened_fail", "needs_info", "screened_pass")]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert len(wins) == 1 and len(errors) == 3
    hist = conn.execute("SELECT COUNT(*) c FROM history WHERE row_id=?", (d["deal_id"],)).fetchone()["c"]
    assert hist >= 4  # every version kept


def test_write_scopes_and_buy_box_protection(setup, admin):
    conn = setup
    with pytest.raises(records.PermissionDenied):
        records.upsert_deal(conn, "analyst", "X", "x|nj")
    with pytest.raises(records.PermissionDenied):
        records.add_fact(conn, "sourcing", "d", "ebitda", 1, "assumption", "x")
    with pytest.raises(records.PermissionDenied):
        approvals.request_action(conn, "analyst", "email_outreach", {}, {}, "k")
    with pytest.raises(PermissionError):
        buybox.set_buy_box(conn, "analyst", {"revenue_min": 1}, "hack")
    run(conn, "sourcing.run", {"sources": ["source_a"]}, "a")
    run(conn, "analyst.screen_ready", {}, "s")
    v2 = buybox.set_buy_box(conn, admin, {**buybox.current(conn)["criteria"], "revenue_min": 5_000_000}, "TEST")
    assert v2 == 2 and conn.execute("SELECT COUNT(*) c FROM buy_box").fetchone()["c"] == 2
    hart = deal_by_name(conn, "Hartwell")
    assert conn.execute("SELECT buy_box_version FROM screenings WHERE deal_id=?", (hart["deal_id"],)).fetchone()[0] == 1


def test_no_unapproved_send_or_spend(setup, admin):
    conn = setup
    run(conn, "sourcing.run", {"sources": ["source_a"]}, "a")
    hart = deal_by_name(conn, "Hartwell")
    sent = []
    senders = {"email_outreach": lambda p, a, idem_key: sent.append((a, idem_key)) or "sent",
               "paid_service": lambda p, a, idem_key: sent.append(("paid", idem_key)) or "ok"}
    aid, created = offmarket.draft_outreach(conn, hart["deal_id"], "Owner", "owner@hartwell.test")
    aid2, created2 = offmarket.draft_outreach(conn, hart["deal_id"], "Owner", "OWNER@hartwell.test")
    assert created and not created2 and aid == aid2  # retry doesn't duplicate drafts
    with pytest.raises(approvals.ApprovalRequired):
        approvals.execute(conn, aid, senders)
    with pytest.raises(PermissionError):
        approvals.decide(conn, "offmarket", aid, True)
    approvals.decide(conn, admin, aid, True)
    approvals.execute(conn, aid, senders)
    approvals.execute(conn, aid, senders)  # retry after success: no second send
    assert len(sent) == 1

    # Spend: no budget -> refused; routine model spend inside budget -> allowed; over -> blocked
    with pytest.raises(approvals.BudgetExceeded):
        approvals.charge(conn, "enrichment", 5, "e1")
    assert approvals.charge(conn, "model", 0.02, "m1") == "charged"
    assert approvals.charge(conn, "model", 0.02, "m1") == "already_charged"
    with pytest.raises(approvals.BudgetExceeded):
        approvals.charge(conn, "model", 100, "m2")
    approvals.set_budget(conn, admin, "paid_services", 100, auto_approve=False)
    pid, _ = approvals.request_action(conn, "offmarket", "email_outreach", {"body": "x"}, {"to": ["a@b.test"]}, "pay-1", cost_estimate=20)
    with pytest.raises(approvals.ApprovalRequired):
        approvals.charge(conn, "paid_services", 20, "direct")  # needs an approved action
    with pytest.raises(approvals.ApprovalRequired):
        approvals.execute(conn, pid, senders)
    assert conn.execute("SELECT COUNT(*) c FROM spend WHERE category='paid_services'").fetchone()["c"] == 0


def test_ownership_criterion_and_thesis_stored(setup, admin):
    conn = setup
    crit = {**buybox.current(conn)["criteria"], "ownership_types": ["family-owned", "founder-led"],
            "thesis": {"summary": "rollups of fragmented service niches"}}
    buybox.set_buy_box(conn, admin, crit, "TEST")
    from pe.agents import sourcing as s
    base = {"source": "source_a", "url": "https://x.test/1", "industry": "HVAC", "state": "NJ", "revenue": "$4M",
            "ebitda": "$800K", "asking_price": "$3.5M", "year_established": 1980,
            "posted_at": datetime.now(timezone.utc).isoformat()}
    fam = s.log_listing(conn, {**base, "external_id": "F1", "business_name": "Fam Air", "ownership": "family-owned"})
    pe_owned = s.log_listing(conn, {**base, "external_id": "F2", "business_name": "PE Air", "ownership": "PE-backed"})
    silent = s.log_listing(conn, {**base, "external_id": "F3", "business_name": "Quiet Air"})
    res = {d: analyst.screen(conn, d)["overall"] for d in (fam["deal_id"], pe_owned["deal_id"], silent["deal_id"])}
    assert res[fam["deal_id"]] == "pass"
    assert res[pe_owned["deal_id"]] == "fail"
    assert res[silent["deal_id"]] == "unknown"  # not stated -> unknown, never assumed family-owned
    assert buybox.current(conn)["criteria"]["thesis"]["summary"].startswith("rollups")
