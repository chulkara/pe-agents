"""The only path to the outside world. Enforced in code, not prompts.

Agents can *request* an action. Only an authenticated admin can approve it, and the
executor re-checks status, permissions, audience and budget right before sending.
Senders are injected adapters; agents never receive a sender.
"""
import json
from datetime import datetime, timezone

from .admin import Admin
from .db import ConflictError, audit, new_id, now, snapshot, tx
from .records import require

CONSEQUENTIAL = {"email_outreach", "listing_response", "slack_reply", "paid_service", "meeting_request"}


class ApprovalRequired(Exception):
    pass


class BudgetExceeded(Exception):
    pass


def request_action(conn, agent, kind, payload, audience, idem_key, cost_estimate=0.0):
    if kind not in CONSEQUENTIAL:
        raise ValueError(kind)
    require(agent, "create", f"action:{kind}")
    with tx(conn):
        row = conn.execute("SELECT action_id FROM actions WHERE idem_key=?", (idem_key,)).fetchone()
        if row:
            return row["action_id"], False
        action_id = new_id("act")
        conn.execute(
            "INSERT INTO actions(action_id,kind,payload_json,audience_json,status,requested_by,idem_key,cost_estimate,created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (action_id, kind, json.dumps(payload), json.dumps(audience), "pending", agent, idem_key, cost_estimate, now()),
        )
        snapshot(conn, "actions", "action_id", action_id, agent)
        audit(conn, agent, "action.requested", action_id=action_id, kind=kind)
    return action_id, True


def pending(conn):
    return conn.execute("SELECT * FROM actions WHERE status='pending' ORDER BY created_at").fetchall()


def decide(conn, admin, action_id, approve, expected_version=None):
    if not isinstance(admin, Admin):
        raise PermissionError("Only an authenticated admin can approve actions")
    with tx(conn):
        row = conn.execute("SELECT * FROM actions WHERE action_id=?", (action_id,)).fetchone()
        if row["status"] != "pending":
            raise ConflictError(f"{action_id} is {row['status']}")
        if expected_version is not None and row["version"] != expected_version:
            raise ConflictError("Action changed since you reviewed it")
        status = "approved" if approve else "rejected"
        conn.execute("UPDATE actions SET status=?, decided_by=?, decided_at=?, version=version+1 WHERE action_id=?",
                     (status, admin.name, now(), action_id))
        snapshot(conn, "actions", "action_id", action_id, admin.name)
        audit(conn, admin.name, f"action.{status}", action_id=action_id)


def policy_approve(conn, action_id, policy, verify):
    """Auto-approval for replies inside the user's explicitly approved scope (e.g. the text
    is exactly an approved FAQ answer or a fixed acknowledgement). `verify(payload)` must
    re-derive the allowed text from the database and confirm the payload matches it."""
    with tx(conn):
        row = conn.execute("SELECT * FROM actions WHERE action_id=?", (action_id,)).fetchone()
        if row["kind"] != "slack_reply" or row["status"] != "pending":
            raise ApprovalRequired("Only pending Slack replies can be policy-approved")
        if not verify(json.loads(row["payload_json"])):
            audit(conn, "policy", "action.policy_refused", action_id=action_id, policy=policy)
            raise ApprovalRequired("Reply is outside the approved scope")
        conn.execute("UPDATE actions SET status='approved', decided_by=?, decided_at=?, version=version+1 WHERE action_id=?",
                     (f"policy:{policy}", now(), action_id))
        snapshot(conn, "actions", "action_id", action_id, f"policy:{policy}")
        audit(conn, "policy", "action.approved", action_id=action_id, policy=policy)


def execute(conn, action_id, senders, recheck=None):
    """Send an approved action exactly once.

    recheck(action_row) -> (ok, reason) is called right before sending, e.g. to confirm a
    Slack user is still active and the channel audience is still authorized.
    """
    row = conn.execute("SELECT * FROM actions WHERE action_id=?", (action_id,)).fetchone()
    if row["status"] == "executed":
        return row["result"]
    if row["status"] != "approved":
        audit(conn, "executor", "action.blocked_unapproved", action_id=action_id, status=row["status"])
        raise ApprovalRequired(f"{action_id} is {row['status']}, not approved")
    if recheck:
        ok, reason = recheck(row)
        if not ok:
            with tx(conn):
                conn.execute("UPDATE actions SET status='blocked', result=?, version=version+1 WHERE action_id=?", (reason, action_id))
                audit(conn, "executor", "action.blocked_recheck", action_id=action_id, reason=reason)
            raise ApprovalRequired(f"Recheck failed: {reason}")
    if row["cost_estimate"] > 0:
        charge(conn, "paid_services", row["cost_estimate"], f"action:{action_id}", approved_action=True)
    # Claim the send before calling the sender, so a crash/retry can't send twice.
    with tx(conn):
        cur = conn.execute("UPDATE actions SET status='executed', executed_at=?, version=version+1 WHERE action_id=? AND status='approved'",
                           (now(), action_id))
        if cur.rowcount != 1:
            return conn.execute("SELECT result FROM actions WHERE action_id=?", (action_id,)).fetchone()["result"]
    sender = senders[row["kind"]]
    result = sender(json.loads(row["payload_json"]), json.loads(row["audience_json"]), idem_key=row["idem_key"])
    with tx(conn):
        conn.execute("UPDATE actions SET result=? WHERE action_id=?", (str(result), action_id))
        snapshot(conn, "actions", "action_id", action_id, "executor")
        audit(conn, "executor", "action.executed", action_id=action_id, result=str(result))
    return result


# Budgets ---------------------------------------------------------------------
def set_budget(conn, admin, category, monthly_limit, auto_approve):
    if not isinstance(admin, Admin):
        raise PermissionError("Only an authenticated admin can set budgets")
    with tx(conn):
        conn.execute("INSERT OR REPLACE INTO budgets VALUES (?,?,?,?)", (category, monthly_limit, int(auto_approve), admin.name))
        audit(conn, admin.name, "budget.set", category=category, monthly_limit=monthly_limit, auto_approve=auto_approve)


def charge(conn, category, amount, idem_key, approved_action=False):
    """Record spend. Routine spend inside an auto-approved budget proceeds; anything else
    needs either an approved action or raises."""
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    with tx(conn):
        if conn.execute("SELECT 1 FROM spend WHERE idem_key=?", (idem_key,)).fetchone():
            return "already_charged"
        b = conn.execute("SELECT * FROM budgets WHERE category=?", (category,)).fetchone()
        if not b:
            raise BudgetExceeded(f"No budget configured for {category}")
        spent = conn.execute("SELECT COALESCE(SUM(amount),0) s FROM spend WHERE category=? AND month=?", (category, month)).fetchone()["s"]
        if spent + amount > b["monthly_limit"]:
            audit(conn, "budget", "spend.blocked_limit", category=category, amount=amount, spent=spent)
            raise BudgetExceeded(f"{category}: {spent}+{amount} > {b['monthly_limit']}")
        if not b["auto_approve"] and not approved_action:
            raise ApprovalRequired(f"{category} spend needs approval")
        conn.execute("INSERT INTO spend VALUES (?,?,?,?,?,?)", (new_id("sp"), category, amount, month, idem_key, now()))
    return "charged"
