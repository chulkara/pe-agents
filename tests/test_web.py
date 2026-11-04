import http.client
import json
import threading

import pytest

from pe import approvals, jobs
from pe.agents import offmarket, sourcing
from pe.web.server import serve


@pytest.fixture
def web(setup, db_path, admin):
    httpd, app = serve(db_path, port=0)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield port
    httpd.shutdown()


class Client:
    def __init__(self, port, host="127.0.0.1"):
        self.port, self.host, self.cookie, self.csrf = port, host, None, None

    def req(self, method, path, body=None, csrf=True, host=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = {"Host": f"{host or self.host}:{self.port}", "Content-Type": "application/json"}
        if self.cookie:
            h["Cookie"] = self.cookie
        if csrf and self.csrf:
            h["X-CSRF-Token"] = self.csrf
        c.request(method, path, json.dumps(body) if body is not None else None, h)
        r = c.getresponse()
        data = r.read()
        sc = r.getheader("Set-Cookie")
        if sc and sc.startswith("pe_session="):
            self.cookie = sc.split(";")[0]
        try:
            return r.status, json.loads(data), dict(r.getheaders())
        except ValueError:
            return r.status, data, dict(r.getheaders())

    def login(self, secret):
        s, d, _ = self.req("POST", "/api/login", {"secret": secret})
        if s == 200:
            self.csrf = d["csrf"]
        return s


def secret_for(conn):
    # conftest's admin fixture keeps the secret only in memory; re-init a known one for web tests
    from pe.admin import _hash
    conn.execute("UPDATE settings SET value=? WHERE key='admin_secret_hash'", (_hash("web-test-secret"),))
    return "web-test-secret"


def test_requires_login_and_rejects_bad_secret(web, conn):
    c = Client(web)
    assert c.req("GET", "/api/deals")[0] == 401
    assert c.req("POST", "/api/run/source", {})[0] == 401
    assert c.login("wrong") == 401
    assert c.login(secret_for(conn)) == 200
    assert c.req("GET", "/api/deals")[0] == 200


def test_lockout_after_repeated_failures(web, conn):
    c = Client(web)
    for _ in range(5):
        c.login("nope")
    assert c.login(secret_for(conn)) == 401  # locked for 5 minutes, even with the right secret


def test_csrf_required_for_changes(web, conn):
    c = Client(web)
    c.login(secret_for(conn))
    assert c.req("POST", "/api/run/source", {}, csrf=False)[0] == 403
    s, d, _ = c.req("POST", "/api/run/source", {})
    assert s == 200 and d["status"] == "succeeded"


def test_only_localhost_host_header(web, conn):
    c = Client(web)
    assert c.req("GET", "/", host="evil.test")[0] == 403  # DNS-rebinding guard
    s, body, h = c.req("GET", "/")
    assert s == 200 and b"Kalling Deal Desk" in body
    assert "script-src 'self'" in h["Content-Security-Policy"]
    assert c.req("GET", "/../pe/db.py")[0] == 404  # no path traversal


def test_full_flow_and_approval_versioning(web, conn):
    c = Client(web)
    c.login(secret_for(conn))
    c.req("POST", "/api/run/source", {"sources": ["source_a"]})
    c.req("POST", "/api/run/screen", {})
    _, deals, _ = c.req("GET", "/api/deals")
    hart = next(d for d in deals if d["name"].startswith("Hartwell"))
    assert hart["state"] == "screened_pass"
    _, detail, _ = c.req("GET", f"/api/deals/{hart['deal_id']}")
    assert detail["models"][0]["built"] and detail["screenings"][0]["overall"] == "pass"
    assert detail["reported"]["revenue"][0]["source_url"].startswith("https://")

    aid, _ = offmarket.draft_outreach(conn, hart["deal_id"], "Tom", "tom@hartwell.test")
    _, q, _ = c.req("GET", "/api/queue")
    item = next(i for i in q if i["action_id"] == aid)
    assert item["audience"]["to"] == ["tom@hartwell.test"] and item["payload"]["body"]
    assert c.req("POST", f"/api/actions/{aid}/approve", {"version": item["version"] + 5})[0] == 409  # stale view
    s, d, _ = c.req("POST", f"/api/actions/{aid}/approve", {"version": item["version"]})
    assert s == 200 and "sender" in d["note"]
    row = conn.execute("SELECT status FROM actions WHERE action_id=?", (aid,)).fetchone()
    assert row["status"] == "approved"  # approved, but nothing was sent: no sender is connected
    assert c.req("POST", f"/api/actions/{aid}/approve", {"version": item["version"] + 1})[0] == 409  # can't approve twice


def test_job_pause_and_cancel_via_web(web, conn):
    c = Client(web)
    c.login(secret_for(conn))
    jid, _ = jobs.submit(conn, "sourcing.run", {"sources": ["source_a"]}, "web-pause")
    assert c.req("POST", f"/api/jobs/{jid}/pause", {})[0] == 200
    assert conn.execute("SELECT status FROM jobs WHERE job_id=?", (jid,)).fetchone()["status"] == "paused"
    assert c.req("POST", f"/api/jobs/{jid}/cancel", {})[0] == 200
    assert conn.execute("SELECT status FROM jobs WHERE job_id=?", (jid,)).fetchone()["status"] == "cancelled"


def test_malicious_listing_does_not_run_in_browser(web, conn):
    pw = pytest.importorskip("playwright.sync_api")
    sourcing.log_listing(conn, {"source": "source_a", "external_id": "X1", "url": "javascript:alert(1)",
                                "business_name": '<img src=x onerror="window.__pwned=1">Evil HVAC',
                                "title": "<script>window.__pwned=2</script>", "description": "<b onmouseover=alert(1)>hi</b>",
                                "industry": "HVAC", "state": "NJ", "revenue": "$3M", "ebitda": "$600K", "asking_price": "$2.5M"})
    secret = secret_for(conn)
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page()
        page.route("**/fonts.g*/**", lambda r: r.abort())
        page.goto(f"http://127.0.0.1:{web}/")
        page.fill("#secret", secret)
        page.click("button[type=submit]")
        page.wait_for_selector("#dealTable tbody tr")
        page.click("text=Evil HVAC")
        page.wait_for_selector("#detail .raw")
        assert page.evaluate("window.__pwned") is None
        assert "<img" in page.inner_text("#detail h2")  # shown as literal text
        assert page.locator("#detail a[href^='javascript']").count() == 0
        b.close()
