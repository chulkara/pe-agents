"""Local dashboard server. Standard library only.

Security model:
- Binds to 127.0.0.1 only, so other machines on your network can't reach it.
- Every API call needs a session from logging in with the admin secret.
- State-changing calls also need the session's CSRF token in a header, so another website
  open in your browser can't trigger approvals.
- Untrusted text (listings, messages) is returned as JSON and rendered as plain text by the
  page; the server never builds HTML from data.
"""
import hmac
import json
import mimetypes
import re
import secrets
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pe.agents  # noqa: F401  registers job handlers
from pe import admin as admin_mod
from pe import approvals, buybox, jobs, records, sources
from pe.db import ConflictError, connect

STATIC = Path(__file__).parent / "static"
SESSION_TTL = 8 * 3600
MAX_BODY = 64 * 1024


class App:
    def __init__(self, db_path):
        self.db_path = db_path
        self.sessions = {}  # token -> {"csrf", "admin", "expires"}
        self.failed = []    # timestamps of failed logins, for a simple lockout

    def conn(self):
        return connect(self.db_path)

    def login(self, secret):
        now = time.time()
        self.failed = [t for t in self.failed if now - t < 300]
        if len(self.failed) >= 5:
            raise PermissionError("Too many failed attempts. Wait 5 minutes.")
        try:
            adm = admin_mod.authenticate(self.conn(), secret)
        except PermissionError:
            self.failed.append(now)
            raise
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
        self.sessions[token] = {"csrf": csrf, "admin": adm, "expires": now + SESSION_TTL}
        return token, csrf, adm.name

    def session(self, token):
        s = self.sessions.get(token or "")
        if not s or s["expires"] < time.time():
            self.sessions.pop(token or "", None)
            return None
        return s


# Read models ------------------------------------------------------------------
def _j(v):
    return json.loads(v) if isinstance(v, str) else v


def summary(conn):
    counts = {r["handoff_state"]: r["c"] for r in conn.execute("SELECT handoff_state, COUNT(*) c FROM deals GROUP BY handoff_state")}
    return {
        "deals": counts,
        "total_deals": sum(counts.values()),
        "pending_approvals": conn.execute("SELECT COUNT(*) c FROM actions WHERE status='pending'").fetchone()["c"],
        "open_questions": conn.execute("SELECT COUNT(*) c FROM questions WHERE status='open'").fetchone()["c"],
        "flagged_listings": conn.execute("SELECT COUNT(*) c FROM listings WHERE flags_json<>'[]'").fetchone()["c"],
        "jobs_running": conn.execute("SELECT COUNT(*) c FROM jobs WHERE status IN ('running','queued','retry_wait')").fetchone()["c"],
        "buy_box": buybox.current(conn),
        "sources": sorted(sources.approved_sources(conn)),
    }


def deals(conn):
    out = []
    for d in conn.execute("SELECT * FROM deals ORDER BY updated_at DESC"):
        f = records.facts_for(conn, d["deal_id"])
        last = lambda k: f[k][-1]["value"] if f.get(k) else None  # noqa: E731
        scr = conn.execute("SELECT overall, buy_box_version FROM screenings WHERE deal_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1",
                           (d["deal_id"],)).fetchone()
        flags = [x for r in conn.execute("SELECT flags_json FROM listings WHERE deal_id=?", (d["deal_id"],)) for x in _j(r[0])]
        out.append({
            "deal_id": d["deal_id"], "name": d["name"], "state": d["handoff_state"], "updated_at": d["updated_at"],
            "industry": last("industry"), "location": last("state"), "revenue": last("revenue"), "ebitda": last("ebitda"),
            "asking_price": last("asking_price"),
            "screening": scr["overall"] if scr else None,
            "sources": conn.execute("SELECT COUNT(DISTINCT source) c FROM listings WHERE deal_id=?", (d["deal_id"],)).fetchone()["c"],
            "flags": sorted({x["flag"] for x in flags}),
            "open_questions": conn.execute("SELECT COUNT(*) c FROM questions WHERE deal_id=? AND status='open'", (d["deal_id"],)).fetchone()["c"],
        })
    return out


def deal_detail(conn, deal_id):
    d = records.get_deal(conn, deal_id)
    if not d:
        return None
    return {
        "deal": dict(d),
        "listings": [{**dict(r), "raw_json": _j(r["raw_json"]), "flags_json": _j(r["flags_json"])} for r in
                     conn.execute("SELECT * FROM listings WHERE deal_id=? ORDER BY retrieved_at", (deal_id,))],
        "reported": records.facts_for(conn, deal_id, "reported"),
        "calculated": records.facts_for(conn, deal_id, "calculated"),
        "screenings": [{**dict(r), "results_json": _j(r["results_json"])} for r in
                       conn.execute("SELECT * FROM screenings WHERE deal_id=? ORDER BY created_at, rowid", (deal_id,))],
        "models": [_j(r[0]) for r in conn.execute("SELECT payload_json FROM models WHERE deal_id=? ORDER BY created_at, rowid", (deal_id,))],
        "questions": [dict(r) for r in conn.execute("SELECT text, status, created_at FROM questions WHERE deal_id=? ORDER BY created_at", (deal_id,))],
        "notes": [dict(r) for r in conn.execute("SELECT agent, body, created_at FROM notes WHERE deal_id=? ORDER BY created_at", (deal_id,))],
        "history": [dict(r) for r in conn.execute(
            "SELECT version, actor, at, json_extract(snapshot_json,'$.handoff_state') state FROM history WHERE table_name='deals' AND row_id=? ORDER BY history_id",
            (deal_id,))],
    }


def queue(conn):
    return [{"action_id": r["action_id"], "kind": r["kind"], "version": r["version"], "requested_by": r["requested_by"],
             "created_at": r["created_at"], "cost_estimate": r["cost_estimate"],
             "payload": _j(r["payload_json"]), "audience": _j(r["audience_json"])} for r in approvals.pending(conn)]


def job_list(conn):
    return [{**dict(r), "result_json": _j(r["result_json"]) if r["result_json"] else None,
             "progress": len(_j(r["checkpoint_json"]).get("done", []))}
            for r in conn.execute("SELECT job_id, kind, status, attempts, max_attempts, last_error, result_json, checkpoint_json, created_at, updated_at "
                                  "FROM jobs ORDER BY created_at DESC LIMIT 50")]


def activity(conn):
    return [{"at": r["at"], "actor": r["actor"], "event": r["event"], "detail": _j(r["detail_json"])}
            for r in conn.execute("SELECT * FROM audit ORDER BY audit_id DESC LIMIT 60")]


# HTTP -------------------------------------------------------------------------
def make_handler(app):
    class Handler(BaseHTTPRequestHandler):
        server_version = "pe-dashboard"

        def log_message(self, fmt, *args):  # keep the terminal quiet
            pass

        def _send(self, code, body, ctype="application/json", headers=None):
            data = body if isinstance(body, bytes) else json.dumps(body, default=str).encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cache-Control", "no-store")
            if ctype.startswith("text/html"):
                self.send_header("Content-Security-Policy",
                                 "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; "
                                 "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; "
                                 "frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
            for k, v in (headers or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data)

        def _cookie_token(self):
            m = re.search(r"(?:^|;\s*)pe_session=([^;]+)", self.headers.get("Cookie", ""))
            return m.group(1) if m else None

        def _body(self):
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                raise ValueError("Request too large")
            return json.loads(self.rfile.read(n) or b"{}")

        def _host_ok(self):
            host = (self.headers.get("Host") or "").split(":")[0]
            return host in ("127.0.0.1", "localhost")  # blocks DNS-rebinding attacks

        def do_GET(self):
            if not self._host_ok():
                return self._send(403, {"error": "Use http://127.0.0.1"})
            path = self.path.split("?")[0]
            if not path.startswith("/api/"):
                rel = "index.html" if path in ("/", "") else path.lstrip("/")
                f = (STATIC / rel).resolve()
                if STATIC.resolve() not in f.parents or not f.is_file():
                    return self._send(404, {"error": "not found"})
                ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
                if f.suffix == ".woff2":
                    ctype = "font/woff2"
                return self._send(200, f.read_bytes(), ctype + ("; charset=utf-8" if ctype.startswith("text") or ctype.endswith("javascript") else ""))
            s = app.session(self._cookie_token())
            if path == "/api/session":
                return self._send(200, {"signed_in": bool(s), "admin": s["admin"].name if s else None, "csrf": s["csrf"] if s else None})
            if not s:
                return self._send(401, {"error": "Sign in first"})
            conn = app.conn()
            m = re.fullmatch(r"/api/deals/(deal_[0-9a-f]{12})", path)
            if path == "/api/summary":
                return self._send(200, summary(conn))
            if path == "/api/deals":
                return self._send(200, deals(conn))
            if m:
                d = deal_detail(conn, m.group(1))
                return self._send(200 if d else 404, d or {"error": "No such deal"})
            if path == "/api/queue":
                return self._send(200, queue(conn))
            if path == "/api/jobs":
                return self._send(200, job_list(conn))
            if path == "/api/activity":
                return self._send(200, activity(conn))
            return self._send(404, {"error": "not found"})

        def do_POST(self):
            if not self._host_ok():
                return self._send(403, {"error": "Use http://127.0.0.1"})
            path = self.path.split("?")[0]
            try:
                body = self._body()
            except (ValueError, json.JSONDecodeError) as e:
                return self._send(400, {"error": str(e)})
            if path == "/api/login":
                try:
                    token, csrf, name = app.login(str(body.get("secret", "")))
                except PermissionError as e:
                    return self._send(401, {"error": str(e)})
                cookie = f"pe_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_TTL}"
                return self._send(200, {"admin": name, "csrf": csrf}, headers={"Set-Cookie": cookie})
            s = app.session(self._cookie_token())
            if not s:
                return self._send(401, {"error": "Sign in first"})
            if not hmac.compare_digest(self.headers.get("X-CSRF-Token", ""), s["csrf"]):
                return self._send(403, {"error": "Missing or wrong security token. Reload the page."})
            if path == "/api/logout":
                app.sessions.pop(self._cookie_token(), None)
                return self._send(200, {"ok": True}, headers={"Set-Cookie": "pe_session=; Max-Age=0; Path=/"})
            conn, adm = app.conn(), s["admin"]
            try:
                m = re.fullmatch(r"/api/actions/(act_[0-9a-f]{12})/(approve|reject)", path)
                if m:
                    approvals.decide(conn, adm, m.group(1), m.group(2) == "approve", expected_version=body.get("version"))
                    return self._send(200, {"ok": True, "status": "approved" if m.group(2) == "approve" else "rejected",
                                            "note": "Approved actions are sent only once a sender is connected." if m.group(2) == "approve" else None})
                m = re.fullmatch(r"/api/jobs/(job_[0-9a-f]{12})/(pause|resume|cancel)", path)
                if m:
                    if m.group(2) == "resume":
                        jobs.resume(conn, m.group(1), adm.name)
                        jobs.run(conn, m.group(1))
                    else:
                        jobs.request(conn, m.group(1), m.group(2), adm.name)
                    return self._send(200, {"ok": True})
                if path == "/api/run/source":
                    srcs = [x for x in body.get("sources", []) if isinstance(x, str)] or sorted(sources.approved_sources(conn))
                    jid, _ = jobs.submit(conn, "sourcing.run", {"sources": srcs}, f"web:{uuid.uuid4().hex}", actor=adm.name)
                    return self._send(200, {"job_id": jid, "status": jobs.run(conn, jid)})
                if path == "/api/run/screen":
                    jid, _ = jobs.submit(conn, "analyst.screen_ready", {}, f"web:{uuid.uuid4().hex}", actor=adm.name)
                    return self._send(200, {"job_id": jid, "status": jobs.run(conn, jid)})
            except ConflictError as e:
                return self._send(409, {"error": f"{e}. Reload to see the latest."})
            except (PermissionError, records.PermissionDenied) as e:
                return self._send(403, {"error": str(e)})
            return self._send(404, {"error": "not found"})

    return Handler


def serve(db_path, port=8787, fixture_sources=None):
    for name, path in (fixture_sources or {}).items():
        sources.register(name, sources.fixture_source(path))
    app = App(db_path)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(app))
    return httpd, app
