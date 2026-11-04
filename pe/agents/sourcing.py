"""On-market sourcing agent.

Searches approved sources, logs each candidate with source URL, retrieval date and the
financials the listing actually states, flags suspicious or stale content, and hands
fresh candidates to screening. Runs as a durable job, ad hoc or on a schedule.
"""
import hashlib
import json
from datetime import datetime, timezone

from .. import records, sources, untrusted
from ..db import audit, new_id, now, tx
from ..jobs import handler

AGENT = "sourcing"
STALE_RETRIEVAL_DAYS = 7


def _days_old(iso):
    if not iso:
        return None
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - dt).days


def deal_key(raw, revenue, asking):
    if raw.get("business_name"):
        return records.normalize_key(raw["business_name"], raw.get("state"))
    if raw.get("industry") and raw.get("state") and revenue and asking:
        # Anonymized listings: same industry, state and rounded financials across sources
        # are treated as the same business. Logged as a possible duplicate for review.
        return f"fp:{raw['industry'].lower()}|{raw['state'].lower()}|{round(revenue, -4):.0f}|{round(asking, -4):.0f}"
    return f"src:{raw['source']}:{raw['external_id']}"


def log_listing(conn, raw, max_age_days=None):
    """Record one listing. Idempotent: logging the same content twice changes nothing."""
    content_hash = hashlib.sha256(json.dumps(raw, sort_keys=True).encode()).hexdigest()[:16]
    revenue = sources.parse_money(raw.get("revenue"))
    ebitda = sources.parse_money(raw.get("ebitda"))
    sde = sources.parse_money(raw.get("cash_flow_sde"))
    asking = sources.parse_money(raw.get("asking_price"))
    retrieved_at = raw.get("retrieved_at") or now()

    flags = []
    hits = untrusted.scan(" ".join(str(raw.get(k, "")) for k in ("title", "description", "business_name")))
    if hits:
        flags.append({"flag": "untrusted_instructions_detected", "patterns": hits})
    if (_days_old(retrieved_at) or 0) > STALE_RETRIEVAL_DAYS:
        flags.append({"flag": "stale_retrieval", "retrieved_at": retrieved_at})
    if max_age_days and (_days_old(raw.get("posted_at")) or 0) > max_age_days:
        flags.append({"flag": "old_listing", "posted_at": raw.get("posted_at")})
    for f, v in (("revenue", raw.get("revenue")), ("ebitda", raw.get("ebitda")), ("asking_price", raw.get("asking_price"))):
        if v not in (None, "") and sources.parse_money(v) is None:
            flags.append({"flag": "unparseable_financial", "field": f, "raw": v})

    name = raw.get("business_name") or raw.get("title") or raw["external_id"]
    deal_id, created = records.upsert_deal(conn, AGENT, name, deal_key(raw, revenue, asking))

    with tx(conn):
        cur = conn.execute(
            "INSERT OR IGNORE INTO listings(listing_id,deal_id,source,external_id,source_url,posted_at,retrieved_at,content_hash,raw_json,flags_json)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (new_id("lst"), deal_id, raw["source"], raw["external_id"], raw["url"], raw.get("posted_at"), retrieved_at,
             content_hash, json.dumps(raw), json.dumps(flags)),
        )
        new_listing = cur.rowcount == 1
        other_sources = conn.execute("SELECT DISTINCT source FROM listings WHERE deal_id=? AND source<>?",
                                     (deal_id, raw["source"])).fetchall()
        if flags and new_listing:
            audit(conn, AGENT, "listing.flagged", deal_id=deal_id, flags=flags)

    reported = {"revenue": revenue, "ebitda": ebitda, "cash_flow_sde": sde, "asking_price": asking,
                "industry": raw.get("industry"), "state": raw.get("state"),
                "year_established": raw.get("year_established"), "posted_at": raw.get("posted_at")}
    for field, value in reported.items():
        if value is not None:  # missing stays missing: no fact row, screening will say unknown
            records.add_fact(conn, AGENT, deal_id, field, value, "reported",
                             evidence=f"Stated on {raw['source']} listing {raw['external_id']}",
                             source_url=raw["url"], retrieved_at=retrieved_at)

    if other_sources and new_listing and raw.get("business_name") is None:
        records.add_note(conn, AGENT, deal_id,
                         f"Possible duplicate across sources: also listed on {[r['source'] for r in other_sources]}. Matched on industry, state and rounded financials.")

    deal = records.get_deal(conn, deal_id)
    stale = any(f["flag"] == "stale_retrieval" for f in flags)
    if deal["handoff_state"] == "new":
        records.set_handoff(conn, AGENT, deal_id, deal["version"], "needs_refresh" if stale else "ready_for_screening")
    elif deal["handoff_state"] == "needs_refresh" and not stale:
        records.set_handoff(conn, AGENT, deal_id, deal["version"], "ready_for_screening")
    elif new_listing and not stale and deal["handoff_state"] in ("screened_pass", "screened_fail", "needs_info"):
        records.set_handoff(conn, AGENT, deal_id, deal["version"], "ready_for_screening")
    return {"deal_id": deal_id, "new_deal": created, "new_listing": new_listing, "flags": flags}


@handler("sourcing.run")
def run_sourcing(ctx):
    """params: {"sources": [...]} ; checkpointed per listing."""
    from .. import buybox
    approved = sources.approved_sources(ctx.conn)
    bb = buybox.current(ctx.conn)
    max_age = bb["criteria"].get("max_listing_age_days") if bb else None
    summary = ctx.checkpoint.get("summary", {"logged": 0, "new_deals": 0, "duplicates": 0, "flagged": 0, "skipped_sources": []})
    for src in ctx.params["sources"]:
        if src not in approved:
            if src not in summary["skipped_sources"]:
                summary["skipped_sources"].append(src)
                audit(ctx.conn, AGENT, "source.refused_unapproved", source=src)
            continue
        for raw in sources.ADAPTERS[src](ctx.params):
            raw = {**raw, "source": src}
            key = f"{src}:{raw['external_id']}:{hashlib.sha256(json.dumps(raw, sort_keys=True).encode()).hexdigest()[:16]}"
            if ctx.is_done(key):
                continue
            r = log_listing(ctx.conn, raw, max_age)
            summary["logged"] += 1
            summary["new_deals"] += int(r["new_deal"])
            summary["duplicates"] += int(not r["new_deal"])
            summary["flagged"] += int(bool(r["flags"]))
            ctx.done(key, summary=summary)
    return summary
