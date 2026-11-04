"""Slack owner app: verified intake, permission-filtered answers, review queue.

Flow for each message:
  1. Verify Slack's signature; drop duplicate deliveries by event_id.
  2. Resolve (team_id, user_id) to an approved identity. Unknown or revoked -> minimal
     onboarding reply only. Display names and claims in the message are ignored.
  3. Check the full audience of the conversation (DM or a configured company channel).
     If anyone present isn't authorized for this company and role, nothing is disclosed.
  4. Decide what to do with rules, not the model:
       - approved FAQ for this company + role  -> auto-reply (inside approved scope)
       - company update / document             -> stored as an attributed, unverified submission
       - meeting request                       -> submission + queued meeting request (not a booking)
       - valuation, terms, commitments, other companies, anything else -> review queue
  5. Every outgoing message is an action; auto-replies are policy-approved only when the
     text exactly matches approved content, and every send rechecks identity and audience.
"""
import json
import re

from .. import approvals, untrusted
from ..db import audit, new_id, now, tx
from .verify import verify

PREFIX = "Kalling assistant (automated): "
TEMPLATES = {
    "onboarding": "Hi, I'm Kalling's automated assistant. I can only help people we've verified. Please contact Karan directly to get set up.",
    "ack_review": "Thanks. I've passed this to Karan, who will reply personally.",
    "ack_update": "Thanks, I've received this. Karan's team will review it; nothing is treated as confirmed until they do.",
    "ack_meeting": "Thanks, I've noted your meeting request. Nothing is booked until Karan confirms a time with you.",
    "no_answer_here": "I can't discuss company matters in this channel. Please message me directly.",
}
SENSITIVE = re.compile(r"\b(valu\w*|worth|price|pricing|offer|loi|letter of intent|terms?|multiple|ebitda|guarantee\w*|promise\w*|commit\w*|"
                       r"contract|exclusiv\w*|deposit|wire|bank|legal|lawsuit|investor|other compan\w*|competitor)\b", re.I)
MEETING = re.compile(r"\b(meet|meeting|call|schedule|calendar|availability|available|zoom|catch up)\b", re.I)
UPDATE = re.compile(r"\b(update|financials?|numbers|report|monthly|quarterly|p&l|attached|attaching|sharing|kpis?)\b", re.I)
ALLOWED_FILE_TYPES = {"pdf", "xlsx", "xls", "csv", "docx", "doc", "png", "jpg", "jpeg"}
FAQ_MIN_OVERLAP = 2


def handle_http(conn, slack, signing_secret, headers, body, now_ts=None):
    """Entry point for Slack's Events API. Returns (status_code, response_body)."""
    if not verify(signing_secret, headers, body, now_ts):
        audit(conn, "slack", "request.rejected_signature")
        return 401, "invalid signature"
    data = json.loads(body)
    if data.get("type") == "url_verification":
        return 200, data["challenge"]
    if data.get("type") != "event_callback":
        return 200, ""
    with tx(conn):
        cur = conn.execute("INSERT OR IGNORE INTO slack_events VALUES (?,?)", (data["event_id"], now()))
        if cur.rowcount == 0:
            return 200, "duplicate"  # Slack retry of an event we already handled
    handle_message(conn, slack, data["team_id"], data["event"], data["event_id"])
    return 200, ""


# Permission checks --------------------------------------------------------------
def identity(conn, team_id, user_id):
    row = conn.execute("SELECT * FROM identities WHERE team_id=? AND user_id=?", (team_id, user_id)).fetchone()
    return row if row and row["status"] == "active" else None


def audience_ok(conn, slack, team_id, channel, company_id, role):
    """True only if every member of the conversation may see this company's information."""
    info = slack.conversation_info(channel)
    if not info.get("is_im"):
        cfg = conn.execute("SELECT * FROM channels WHERE channel_id=?", (channel,)).fetchone()
        if not cfg or cfg["company_id"] != company_id or cfg["audience"] != role:
            return False, "channel not configured for this company and audience"
    for m in slack.members(channel):
        if m == slack.bot_user:
            continue
        u = slack.user_info(m)
        if u.get("is_bot"):
            return False, f"unapproved bot {m} in conversation"
        if conn.execute("SELECT 1 FROM internal_users WHERE team_id=? AND user_id=?", (u.get("team_id"), m)).fetchone():
            continue
        ident = identity(conn, u.get("team_id"), m)
        if not ident or ident["company_id"] != company_id or ident["role"] != role:
            kind = "guest" if u.get("is_restricted") else ("external" if u.get("is_stranger") else "unauthorized")
            return False, f"{kind} member {m} is not authorized for {company_id}"
    return True, "ok"


# Conversation state, scoped to company + channel + thread ------------------------
def convo_id(conn, company_id, channel, thread_ts, audience):
    with tx(conn):
        conn.execute("INSERT OR IGNORE INTO conversations VALUES (?,?,?,?,?)",
                     (new_id("cv"), company_id, channel, thread_ts, audience))
        return conn.execute("SELECT convo_id FROM conversations WHERE company_id=? AND channel_id=? AND thread_ts=?",
                            (company_id, channel, thread_ts)).fetchone()["convo_id"]


def log_message(conn, cid, direction, user_id, body):
    with tx(conn):
        conn.execute("INSERT INTO messages VALUES (?,?,?,?,?,?)", (new_id("msg"), cid, direction, user_id, body, now()))


# FAQ retrieval: filtered by company and audience in SQL, before any matching --------
def find_faq(conn, company_id, role, text):
    words = set(re.findall(r"[a-z]+", text.lower()))
    rows = conn.execute(
        "SELECT * FROM approved_content WHERE kind='faq' AND (company_id IS NULL OR company_id=?) "
        "AND audience IN (?, 'all_owners')", (company_id, role)).fetchall()
    best, score = None, 0
    for r in rows:
        s = len(words & set(r["keywords"].split(",")))
        if s > score:
            best, score = r, s
    return best if score >= FAQ_MIN_OVERLAP else None


def expected_text(conn, payload):
    ref = payload.get("content_ref", "")
    if ref.startswith("template:"):
        base = TEMPLATES.get(ref.split(":", 1)[1])
    elif ref.startswith("faq:"):
        row = conn.execute("SELECT * FROM approved_content WHERE content_id=?", (ref[4:],)).fetchone()
        base = row["answer"] if row and (row["company_id"] in (None, payload.get("company_id"))) else None
    else:
        base = None
    return PREFIX + base if base else None


def recheck_factory(conn, slack, team_id):
    def recheck(action):
        payload, aud = json.loads(action["payload_json"]), json.loads(action["audience_json"])
        if aud.get("onboarding"):
            return True, "onboarding reply carries no company data"
        ident = identity(conn, team_id, aud["requester"])
        if not ident or ident["company_id"] != aud["company_id"]:
            return False, "requester no longer authorized for this company"
        return audience_ok(conn, slack, team_id, aud["channel"], aud["company_id"], aud["role"])
    return recheck


def _reply(conn, slack, team_id, event_id, suffix, channel, thread_ts, text, content_ref, audience, auto):
    payload = {"channel": channel, "thread_ts": thread_ts, "text": text, "content_ref": content_ref,
               "company_id": audience.get("company_id")}
    aid, created = approvals.request_action(conn, "slack_app", "slack_reply", payload, audience,
                                            idem_key=f"slack:{event_id}:{suffix}")
    if not created:
        return aid
    if auto:
        approvals.policy_approve(conn, aid, "approved_scope", lambda p: expected_text(conn, p) == p["text"])
        try:
            approvals.execute(conn, aid, {"slack_reply": lambda p, a, idem_key: slack.post(p["channel"], p["text"], p["thread_ts"])},
                              recheck_factory(conn, slack, team_id))
        except approvals.ApprovalRequired:
            pass  # blocked by recheck; logged in audit
    return aid


def _attachments(files):
    out = []
    for f in files or []:
        ext = (f.get("filetype") or f.get("name", "").rsplit(".", 1)[-1]).lower()
        flags = []
        if ext not in ALLOWED_FILE_TYPES:
            flags.append("blocked_file_type")
        flags += [f"untrusted_instructions:{p}" for p in untrusted.scan(f"{f.get('name', '')} {f.get('title', '')} {f.get('preview', '')}")]
        out.append({"id": f.get("id"), "name": f.get("name"), "type": ext, "size": f.get("size"), "flags": flags,
                    "status": "quarantined" if flags else "stored_unopened"})
    return out


def handle_message(conn, slack, team_id, ev, event_id):
    if ev.get("type") != "message" or ev.get("bot_id") or ev.get("subtype") not in (None, "file_share"):
        return
    user, channel = ev.get("user"), ev.get("channel")
    text = ev.get("text", "")
    thread = ev.get("thread_ts") or ev.get("ts")
    is_im = ev.get("channel_type") == "im"
    ident = identity(conn, team_id, user)

    if not ident:
        audit(conn, "slack_app", "message.unknown_user", team_id=team_id, user_id=user, channel=channel)
        if is_im:
            _reply(conn, slack, team_id, event_id, "onboarding", channel, thread, PREFIX + TEMPLATES["onboarding"],
                   "template:onboarding", {"onboarding": True, "channel": channel, "requester": user}, auto=True)
        return

    company, role = ident["company_id"], ident["role"]
    ok, why = audience_ok(conn, slack, team_id, channel, company, role)
    audience = {"channel": channel, "company_id": company, "role": role, "requester": user, "members": slack.members(channel)}
    if not ok:
        audit(conn, "slack_app", "message.audience_blocked", channel=channel, company_id=company, reason=why)
        approvals.request_action(conn, "slack_app", "slack_reply",
                                 {"channel": channel, "thread_ts": thread, "text": "", "note": f"Not answered: {why}. Original: {text[:500]}",
                                  "company_id": company}, audience, idem_key=f"slack:{event_id}:blocked")
        return

    cid = convo_id(conn, company, channel, thread, role)
    log_message(conn, cid, "in", user, text)
    files = _attachments(ev.get("files"))
    flags = untrusted.scan(text)
    if flags:
        audit(conn, "slack_app", "message.untrusted_instructions", user_id=user, patterns=flags)

    other_companies = [r["name"] for r in conn.execute("SELECT name FROM companies WHERE company_id<>?", (company,)).fetchall()
                       if r["name"].lower() in text.lower()]

    def submit(kind):
        with tx(conn):
            conn.execute("INSERT OR IGNORE INTO submissions(submission_id,company_id,contact_id,kind,body,attachments_json,slack_ts,created_at)"
                         " VALUES (?,?,?,?,?,?,?,?)",
                         (f"sub_{event_id}_{kind}", company, ident["contact_id"], kind, text, json.dumps(files), ev.get("ts"), now()))
        audit(conn, "slack_app", "submission.stored", company_id=company, kind=kind, files=len(files))

    def to_review(reason):
        approvals.request_action(conn, "slack_app", "slack_reply",
                                 {"channel": channel, "thread_ts": thread, "text": "", "company_id": company,
                                  "note": f"Needs your reply ({reason}). Owner wrote: {text[:1000]}"},
                                 audience, idem_key=f"slack:{event_id}:review")
        _reply(conn, slack, team_id, event_id, "ack", channel, thread, PREFIX + TEMPLATES["ack_review"],
               "template:ack_review", audience, auto=True)

    if other_companies:
        return to_review("mentions another company")
    if SENSITIVE.search(text) or flags:
        return to_review("valuation, terms, commitments or other sensitive topic" if not flags else "message contains instruction-like text")
    is_question = "?" in text or bool(re.match(r"\s*(how|what|when|where|who|which|can|do|does|is|are|should)\b", text, re.I))
    faq = find_faq(conn, company, role, text) if is_question and not files else None
    if faq:
        return _reply(conn, slack, team_id, event_id, "faq", channel, thread, PREFIX + faq["answer"],
                      f"faq:{faq['content_id']}", audience, auto=True)
    if is_question and not files and not MEETING.search(text):
        return to_review("question without an approved answer")
    if MEETING.search(text):
        submit("meeting_request")
        approvals.request_action(conn, "slack_app", "meeting_request",
                                 {"company_id": company, "contact_id": ident["contact_id"], "text": text,
                                  "status": "requested, not booked"}, audience, idem_key=f"slack:{event_id}:meeting")
        return _reply(conn, slack, team_id, event_id, "ack", channel, thread, PREFIX + TEMPLATES["ack_meeting"],
                      "template:ack_meeting", audience, auto=True)
    if files or UPDATE.search(text):
        submit("document" if files else "company_update")
        return _reply(conn, slack, team_id, event_id, "ack", channel, thread, PREFIX + TEMPLATES["ack_update"],
                      "template:ack_update", audience, auto=True)
    return to_review("no approved answer")
