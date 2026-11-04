"""Investment analyst agent: screening and returns models.

Screening checks every buy-box criterion and records pass / fail / unknown with the
evidence used. Missing or conflicting numbers are 'unknown' plus an open question,
never a guess. Returns models are built only for deals that pass every criterion, and
keep reported figures, labeled scenario assumptions and calculations in separate sections.
"""
import hashlib
import json
from datetime import datetime, timezone

from .. import buybox, records
from ..db import audit, new_id, now, tx
from ..jobs import handler

AGENT = "analyst"
CONFLICT_TOLERANCE = 0.05  # values from different sources more than 5% apart count as conflicting


def _one(facts, field):
    """-> (value, status, evidence). status: 'ok' | 'missing' | 'conflict'."""
    vals = facts.get(field, [])
    if not vals:
        return None, "missing", f"No source reports {field}"
    distinct = {}
    for v in vals:
        distinct.setdefault(json.dumps(v["value"]), v)
    ev = "; ".join(f"{v['value']} ({v['source_url']}, retrieved {v['retrieved_at']})" for v in distinct.values())
    nums = [v["value"] for v in distinct.values()]
    if len(distinct) > 1:
        if all(isinstance(n, (int, float)) for n in nums) and (max(nums) - min(nums)) <= CONFLICT_TOLERANCE * max(nums):
            return max(nums, key=nums.count), "ok", ev
        return None, "conflict", f"Sources disagree: {ev}"
    return nums[0], "ok", ev


def _res(criterion, result, evidence, value=None):
    return {"criterion": criterion, "result": result, "evidence": evidence, "value": value}


def screen_deal(conn, deal_id, bb):
    c = bb["criteria"]
    f = records.facts_for(conn, deal_id, "reported")
    results, questions, calcs = [], [], {}

    def need(field, label):
        v, st, ev = _one(f, field)
        if st == "missing":
            questions.append(f"What is the {label}? No source states it.")
        elif st == "conflict":
            questions.append(f"Which {label} is correct? {ev}")
        return v, st, ev

    def in_list(crit, field, label):
        if crit not in c:
            return
        v, st, ev = need(field, label)
        if st != "ok":
            results.append(_res(crit, "unknown", ev))
        else:
            ok = str(v).lower() in [x.lower() for x in c[crit]]
            results.append(_res(crit, "pass" if ok else "fail", f"{label} is {v}. {ev}", v))

    def bound(crit, value, st, ev, label, lo=True):
        if crit not in c:
            return
        if st != "ok":
            results.append(_res(crit, "unknown", ev))
            return
        limit = c[crit]
        ok = value >= limit if lo else value <= limit
        results.append(_res(crit, "pass" if ok else "fail",
                            f"{label} {value:,.2f} vs {'minimum' if lo else 'maximum'} {limit:,}. {ev}", value))

    in_list("industries", "industry", "industry")
    in_list("states", "state", "state")
    in_list("ownership_types", "ownership", "ownership (e.g. family-owned, founder-led)")

    rev, rst, rev_ev = need("revenue", "annual revenue")
    bound("revenue_min", rev, rst, rev_ev, "Revenue")
    bound("revenue_max", rev, rst, rev_ev, "Revenue", lo=False)

    e, est, e_ev = _one(f, "ebitda")
    if est == "missing":
        sde, sst, _ = _one(f, "cash_flow_sde")
        e_ev = ("Only seller's discretionary earnings (SDE) is reported; SDE is not EBITDA and is not converted."
                if sst == "ok" else "No source reports EBITDA")
        questions.append("What is EBITDA (after a market-rate owner salary)? Only SDE or nothing is reported."
                         if sst == "ok" else "What is EBITDA? No source states it.")
    elif est == "conflict":
        questions.append(f"Which EBITDA is correct? {e_ev}")
    bound("ebitda_min", e, est, e_ev, "EBITDA")
    bound("ebitda_max", e, est, e_ev, "EBITDA", lo=False)

    if "ebitda_margin_min" in c:
        if est == "ok" and rst == "ok" and rev:
            calcs["ebitda_margin"] = e / rev
            bound("ebitda_margin_min", e / rev, "ok", f"Calculated: EBITDA {e:,.0f} / revenue {rev:,.0f}", "EBITDA margin")
        else:
            results.append(_res("ebitda_margin_min", "unknown", "Needs both EBITDA and revenue"))

    ask, ast, a_ev = need("asking_price", "asking price")
    if "asking_multiple_max" in c:
        if est == "ok" and ast == "ok" and e:
            calcs["asking_multiple"] = ask / e
            bound("asking_multiple_max", ask / e, "ok", f"Calculated: asking {ask:,.0f} / EBITDA {e:,.0f}", "Asking multiple", lo=False)
        else:
            results.append(_res("asking_multiple_max", "unknown", "Needs both asking price and EBITDA"))

    if "years_in_business_min" in c:
        y, yst, y_ev = need("year_established", "year established")
        if yst == "ok":
            age = datetime.now(timezone.utc).year - int(y)
            calcs["years_in_business"] = age
            bound("years_in_business_min", age, "ok", f"Calculated from year established {y}", "Years in business")
        else:
            results.append(_res("years_in_business_min", "unknown", y_ev))

    if "max_listing_age_days" in c:
        p, pst, p_ev = _one(f, "posted_at")
        if pst == "ok":
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(p.replace("Z", "+00:00")).replace(tzinfo=timezone.utc)).days
            bound("max_listing_age_days", age, "ok", f"Listing posted {p}", "Listing age (days)", lo=False)
        else:
            results.append(_res("max_listing_age_days", "unknown", p_ev))

    overall = "fail" if any(r["result"] == "fail" for r in results) else (
        "unknown" if any(r["result"] == "unknown" for r in results) else "pass")
    return results, overall, questions, calcs


def build_model(reported, assumptions):
    """Simple levered-returns scenario. Returns None if any assumption is missing."""
    needed = ["debt_pct", "interest_rate", "ebitda_growth", "exit_multiple", "hold_years", "capex_pct_of_ebitda", "tax_rate"]
    missing = [k for k in needed if k not in (assumptions or {})]
    if missing:
        return {"built": False, "reason": f"Missing scenario assumptions: {missing}. Not filled in by default."}
    a = assumptions
    price, e0 = reported["asking_price"], reported["ebitda"]
    debt = price * a["debt_pct"]
    equity = price - debt
    years, cash, rows = a["hold_years"], 0.0, []
    for yr in range(1, years + 1):
        e = e0 * (1 + a["ebitda_growth"]) ** yr
        interest = debt * a["interest_rate"]
        fcf = (e - interest) * (1 - a["tax_rate"]) - e * a["capex_pct_of_ebitda"]
        paydown = min(debt, max(fcf, 0))
        debt -= paydown
        cash += max(fcf, 0) - paydown
        rows.append({"year": yr, "ebitda": round(e), "interest": round(interest), "free_cash_flow": round(fcf), "debt_end": round(debt)})
    exit_ev = rows[-1]["ebitda"] * a["exit_multiple"]
    exit_equity = exit_ev - debt + cash
    moic = exit_equity / equity
    return {
        "built": True,
        "reported_inputs": {"asking_price": price, "ebitda": e0, "label": "Reported by the listing source"},
        "assumptions": {**a, "label": "SCENARIO ASSUMPTIONS set by the user in the buy box, not facts"},
        "calculated": {"entry_debt": price * a["debt_pct"], "entry_equity": equity, "yearly": rows,
                       "exit_enterprise_value": exit_ev, "exit_equity": round(exit_equity),
                       "moic": round(moic, 2), "irr": round(moic ** (1 / years) - 1, 4),
                       "label": "PROJECTION under the assumptions above, not a forecast or fact"},
    }


def screen(conn, deal_id):
    bb = buybox.current(conn)
    if not bb:
        raise RuntimeError("No buy box set. The user must set one first.")
    facts = records.facts_for(conn, deal_id, "reported")
    input_hash = hashlib.sha256(json.dumps([facts, bb["version"]], sort_keys=True, default=str).encode()).hexdigest()[:16]
    results, overall, questions, calcs = screen_deal(conn, deal_id, bb)
    with tx(conn):
        cur = conn.execute(
            "INSERT OR IGNORE INTO screenings(screening_id,deal_id,buy_box_version,input_hash,results_json,overall,created_by,created_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (new_id("scr"), deal_id, bb["version"], input_hash, json.dumps(results), overall, AGENT, now()))
        fresh = cur.rowcount == 1
    if fresh:
        for k, v in calcs.items():
            records.add_fact(conn, AGENT, deal_id, k, v, "calculated", evidence="Calculated from reported facts during screening")
        for q in questions:
            records.add_question(conn, AGENT, deal_id, q)
        if overall == "pass":
            v_e, _, _ = _one(facts, "ebitda")
            v_a, _, _ = _one(facts, "asking_price")
            model = build_model({"asking_price": v_a, "ebitda": v_e}, bb["criteria"].get("model_assumptions"))
            with tx(conn):
                conn.execute("INSERT OR IGNORE INTO models(model_id,deal_id,buy_box_version,input_hash,payload_json,created_by,created_at)"
                             " VALUES (?,?,?,?,?,?,?)", (new_id("mdl"), deal_id, bb["version"], input_hash, json.dumps(model), AGENT, now()))
        deal = records.get_deal(conn, deal_id)
        target = {"pass": "screened_pass", "fail": "screened_fail", "unknown": "needs_info"}[overall]
        records.set_handoff(conn, AGENT, deal_id, deal["version"], target)
        audit(conn, AGENT, "deal.screened", deal_id=deal_id, overall=overall, buy_box_version=bb["version"])
    return {"deal_id": deal_id, "overall": overall, "buy_box_version": bb["version"], "new": fresh}


@handler("analyst.screen_ready")
def run_screening(ctx):
    ids = [r["deal_id"] for r in ctx.conn.execute(
        "SELECT deal_id FROM deals WHERE handoff_state='ready_for_screening' ORDER BY created_at").fetchall()]
    out = ctx.checkpoint.get("results", {})
    for d in ids:
        if ctx.is_done(d):
            continue
        out[d] = screen(ctx.conn, d)["overall"]
        ctx.done(d, results=out)
    return out
