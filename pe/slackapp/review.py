"""Authenticated review queue for Slack replies and meeting requests."""
import json

from .. import approvals
from ..admin import Admin
from ..db import audit, snapshot, tx
from .bot import PREFIX, recheck_factory


def queue(conn, admin):
    if not isinstance(admin, Admin):
        raise PermissionError("Admin authentication required")
    out = []
    for r in approvals.pending(conn):
        p, a = json.loads(r["payload_json"]), json.loads(r["audience_json"])
        out.append({"action_id": r["action_id"], "version": r["version"], "kind": r["kind"],
                    "company": a.get("company_id"), "channel": a.get("channel"),
                    "audience_members": a.get("members"), "note": p.get("note"),
                    "exact_text": p.get("text") or "(you write the reply)"})
    return out


def approve_reply(conn, admin, slack, team_id, action_id, text, expected_version):
    """Set the exact reply text, approve it, then send after rechecking identity and audience."""
    if not isinstance(admin, Admin):
        raise PermissionError("Admin authentication required")
    with tx(conn):
        row = conn.execute("SELECT * FROM actions WHERE action_id=?", (action_id,)).fetchone()
        if row["version"] != expected_version or row["status"] != "pending":
            raise approvals.ConflictError("This item changed since you reviewed it")
        p = json.loads(row["payload_json"])
        p["text"] = text if text.startswith(PREFIX) else PREFIX + text
        p["content_ref"] = f"admin:{admin.name}"
        conn.execute("UPDATE actions SET payload_json=?, version=version+1 WHERE action_id=?", (json.dumps(p), action_id))
        snapshot(conn, "actions", "action_id", action_id, admin.name)
        audit(conn, admin.name, "action.text_set", action_id=action_id)
    approvals.decide(conn, admin, action_id, True, expected_version=expected_version + 1)
    return approvals.execute(conn, action_id,
                             {"slack_reply": lambda p, a, idem_key: slack.post(p["channel"], p["text"], p["thread_ts"])},
                             recheck_factory(conn, slack, team_id))
