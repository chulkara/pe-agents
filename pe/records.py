"""Designated records per agent, versioned updates and permission checks.

Every write goes through these functions, which check the caller's write scope first.
Agents get no delete function; history keeps every prior version.
"""
import hashlib
import json
import re

from .db import ConflictError, audit, new_id, now, snapshot, tx

# Which records each agent may create or update. Anything not listed is refused.
WRITE_SCOPES = {
    "sourcing": {
        "create": {"deal", "listing", "fact:reported", "note"},
        "handoff": {"new": {"ready_for_screening", "needs_refresh"}, "needs_refresh": {"ready_for_screening"},
                    # new evidence on an already-screened deal sends it back for re-screening
                    "screened_pass": {"ready_for_screening"}, "screened_fail": {"ready_for_screening"},
                    "needs_info": {"ready_for_screening"}},
    },
    "offmarket": {"create": {"deal", "fact:reported", "note", "action:email_outreach"}, "handoff": {}},
    "analyst": {
        "create": {"screening", "model", "fact:calculated", "fact:assumption", "question", "note"},
        "handoff": {
            "ready_for_screening": {"screened_pass", "screened_fail", "needs_info"},
            "needs_info": {"screened_pass", "screened_fail", "needs_info"},
            "screened_pass": {"screened_pass", "screened_fail", "needs_info"},
            "screened_fail": {"screened_pass", "screened_fail", "needs_info"},
        },
    },
    "deal_assistant": {"create": {"note", "question", "action:meeting_request"}, "handoff": {}},
    "slack_app": {"create": {"submission", "action:slack_reply", "action:meeting_request"}, "handoff": {}},
}


class PermissionDenied(Exception):
    pass


def require(agent, op, target):
    scope = WRITE_SCOPES.get(agent)
    if not scope or target not in scope.get(op, set()):
        raise PermissionDenied(f"{agent} may not {op} {target}")


def normalize_key(name, state):
    n = re.sub(r"[^a-z0-9 ]", "", name.lower())
    n = re.sub(r"\b(llc|inc|co|corp|company|the|and)\b", "", n)
    n = re.sub(r"\s+", " ", n).strip()
    return f"{n}|{(state or '').lower()}"


def stable_deal_id(key):
    return "deal_" + hashlib.sha256(key.encode()).hexdigest()[:12]


def upsert_deal(conn, agent, name, key):
    """Idempotent: the same business key always maps to the same deal_id."""
    require(agent, "create", "deal")
    deal_id = stable_deal_id(key)
    with tx(conn):
        cur = conn.execute(
            "INSERT OR IGNORE INTO deals(deal_id,normalized_key,name,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?)",
            (deal_id, key, name, agent, now(), now()),
        )
        created = cur.rowcount == 1
        if created:
            snapshot(conn, "deals", "deal_id", deal_id, agent)
            audit(conn, agent, "deal.created", deal_id=deal_id, name=name)
    return deal_id, created


def get_deal(conn, deal_id):
    return conn.execute("SELECT * FROM deals WHERE deal_id=?", (deal_id,)).fetchone()


def set_handoff(conn, agent, deal_id, expected_version, new_state):
    """Optimistic lock: fails with ConflictError if someone else changed the deal first."""
    with tx(conn):
        deal = get_deal(conn, deal_id)
        allowed = WRITE_SCOPES.get(agent, {}).get("handoff", {}).get(deal["handoff_state"], set())
        if new_state not in allowed:
            raise PermissionDenied(f"{agent} may not move {deal['handoff_state']} -> {new_state}")
        cur = conn.execute(
            "UPDATE deals SET handoff_state=?, version=version+1, updated_at=? WHERE deal_id=? AND version=?",
            (new_state, now(), deal_id, expected_version),
        )
        if cur.rowcount != 1:
            raise ConflictError(f"{deal_id} changed since version {expected_version}")
        snapshot(conn, "deals", "deal_id", deal_id, agent)
        audit(conn, agent, "deal.handoff", deal_id=deal_id, to=new_state)


def add_fact(conn, agent, deal_id, field, value, kind, evidence, source_url=None, retrieved_at=None):
    require(agent, "create", f"fact:{kind}")
    dedupe = hashlib.sha256(json.dumps([deal_id, field, value, kind, source_url, retrieved_at]).encode()).hexdigest()
    with tx(conn):
        conn.execute(
            "INSERT OR IGNORE INTO facts(fact_id,deal_id,field,value_json,kind,source_url,retrieved_at,evidence,recorded_by,dedupe_key,created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (new_id("fact"), deal_id, field, json.dumps(value), kind, source_url, retrieved_at, evidence, agent, dedupe, now()),
        )


def facts_for(conn, deal_id, kind="reported"):
    rows = conn.execute(
        "SELECT * FROM facts WHERE deal_id=? AND kind=? ORDER BY retrieved_at, created_at", (deal_id, kind)
    ).fetchall()
    out = {}
    for r in rows:
        out.setdefault(r["field"], []).append(
            {"value": json.loads(r["value_json"]), "source_url": r["source_url"], "retrieved_at": r["retrieved_at"], "evidence": r["evidence"]}
        )
    return out


def add_note(conn, agent, deal_id, body):
    require(agent, "create", "note")
    with tx(conn):
        conn.execute("INSERT INTO notes(note_id,deal_id,agent,body,created_at) VALUES (?,?,?,?,?)",
                     (new_id("note"), deal_id, agent, body, now()))


def add_question(conn, agent, deal_id, text):
    require(agent, "create", "question")
    dedupe = hashlib.sha256(f"{deal_id}|{text}".encode()).hexdigest()
    with tx(conn):
        conn.execute(
            "INSERT OR IGNORE INTO questions(question_id,deal_id,text,created_by,dedupe_key,created_at) VALUES (?,?,?,?,?,?)",
            (new_id("q"), deal_id, text, agent, dedupe, now()),
        )
