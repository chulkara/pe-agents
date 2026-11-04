"""Command line for running and controlling the system.

  python -m pe.cli init-admin karan                 # prints the admin secret once
  export PE_ADMIN_SECRET=...                        # needed for any admin command
  python -m pe.cli set-buybox buybox.json --label TEST
  python -m pe.cli source --sources source_a        # ad hoc sourcing job
  python -m pe.cli screen                           # screen everything ready
  python -m pe.cli worker                           # run queued jobs and retries once
  python -m pe.cli jobs | pause JOB | resume JOB | cancel JOB
  python -m pe.cli deals | deal DEAL_ID
  python -m pe.cli queue | approve ACTION_ID | reject ACTION_ID
"""
import argparse
import json
import os
import time
import uuid

import pe.agents  # noqa: F401
from pe import admin as admin_mod
from pe import approvals, buybox, jobs, records, sources
from pe.db import connect


def main(argv=None):
    ap = argparse.ArgumentParser(prog="pe")
    ap.add_argument("--db", default=os.environ.get("PE_DB", "pe.sqlite"))
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init-admin").add_argument("name")
    so = sub.add_parser("approve-source"); so.add_argument("name"); so.add_argument("--terms", required=True)
    bu = sub.add_parser("set-budget"); bu.add_argument("category"); bu.add_argument("limit", type=float); bu.add_argument("--auto", action="store_true")
    b = sub.add_parser("set-buybox"); b.add_argument("file"); b.add_argument("--label", required=True)
    dsh = sub.add_parser("dashboard"); dsh.add_argument("--port", type=int, default=8787)
    dm = sub.add_parser("demo", help="One-step demo: sets up test data and opens the dashboard")
    dm.add_argument("--port", type=int, default=8787)
    th = sub.add_parser("set-thesis"); th.add_argument("file", help="JSON file with the thesis object")
    sub.add_parser("buybox"); sub.add_parser("buybox-history")
    s = sub.add_parser("source"); s.add_argument("--sources", nargs="+", required=True); s.add_argument("--key")
    sc = sub.add_parser("screen"); sc.add_argument("--key")
    sub.add_parser("worker"); sub.add_parser("jobs"); sub.add_parser("deals"); sub.add_parser("queue")
    for c in ("pause", "resume", "cancel"):
        sub.add_parser(c).add_argument("job_id")
    sub.add_parser("deal").add_argument("deal_id")
    for c in ("approve", "reject"):
        sub.add_parser(c).add_argument("action_id")
    a = ap.parse_args(argv)
    conn = connect(a.db)
    # Demo/test sources: PE_FIXTURE_SOURCES='{"source_a": "tests/fixtures/source_a.json"}'
    for name, path in json.loads(os.environ.get("PE_FIXTURE_SOURCES", "{}")).items():
        sources.register(name, sources.fixture_source(path))

    if a.cmd == "demo":
        return demo(a.port)
    if a.cmd == "dashboard":
        from pe.web.server import serve
        httpd, _ = serve(a.db, a.port)
        print(f"Dashboard running at http://127.0.0.1:{a.port}  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("Stopped")
        return
    if a.cmd == "init-admin":
        print("Admin secret (store it safely, shown once):", admin_mod.init_admin(conn, a.name))
    elif a.cmd == "approve-source":
        sources.approve_source(conn, admin_mod.authenticate(conn), a.name, a.terms); print("approved", a.name)
    elif a.cmd == "set-budget":
        approvals.set_budget(conn, admin_mod.authenticate(conn), a.category, a.limit, a.auto); print("budget set")
    elif a.cmd == "set-buybox":
        adm = admin_mod.authenticate(conn)
        print("buy box version", buybox.set_buy_box(conn, adm, json.load(open(a.file)), a.label))
    elif a.cmd == "set-thesis":
        print("buy box version", buybox.set_thesis(conn, admin_mod.authenticate(conn), json.load(open(a.file))))
    elif a.cmd == "buybox":
        print(json.dumps(buybox.current(conn), indent=2))
    elif a.cmd == "buybox-history":
        for h in buybox.history(conn):
            print(h)
    elif a.cmd == "source":
        jid, new = jobs.submit(conn, "sourcing.run", {"sources": a.sources}, a.key or f"adhoc:{uuid.uuid4().hex}", actor="cli")
        print(jid, "submitted" if new else "already exists", jobs.run(conn, jid))
    elif a.cmd == "screen":
        jid, _ = jobs.submit(conn, "analyst.screen_ready", {}, a.key or f"screen:{uuid.uuid4().hex}", actor="cli")
        print(jid, jobs.run(conn, jid))
    elif a.cmd == "worker":
        print(jobs.run_pending(conn))
    elif a.cmd == "jobs":
        for r in conn.execute("SELECT job_id,kind,status,attempts,last_error,updated_at FROM jobs ORDER BY created_at DESC LIMIT 30"):
            print(dict(r))
    elif a.cmd in ("pause", "cancel"):
        jobs.request(conn, a.job_id, a.cmd, admin_mod.authenticate(conn).name); print(a.cmd, "requested")
    elif a.cmd == "resume":
        jobs.resume(conn, a.job_id, admin_mod.authenticate(conn).name); print("resumed; run `worker` to continue")
    elif a.cmd == "deals":
        for r in conn.execute("SELECT deal_id,name,handoff_state,version FROM deals ORDER BY updated_at DESC"):
            print(dict(r))
    elif a.cmd == "deal":
        print(json.dumps({
            "deal": dict(records.get_deal(conn, a.deal_id)),
            "reported_facts": records.facts_for(conn, a.deal_id, "reported"),
            "calculated": records.facts_for(conn, a.deal_id, "calculated"),
            "screenings": [dict(r) | {"results_json": json.loads(r["results_json"])} for r in
                           conn.execute("SELECT * FROM screenings WHERE deal_id=? ORDER BY created_at, rowid", (a.deal_id,))],
            "models": [json.loads(r[0]) for r in conn.execute("SELECT payload_json FROM models WHERE deal_id=?", (a.deal_id,))],
            "open_questions": [r[0] for r in conn.execute("SELECT text FROM questions WHERE deal_id=? AND status='open'", (a.deal_id,))],
        }, indent=2, default=str))
    elif a.cmd == "queue":
        for r in approvals.pending(conn):
            print(r["action_id"], r["kind"], r["version"], json.loads(r["audience_json"]), json.loads(r["payload_json"]))
    elif a.cmd in ("approve", "reject"):
        approvals.decide(conn, admin_mod.authenticate(conn), a.action_id, a.cmd == "approve"); print(a.cmd + "d")


def demo(port):
    """Everything in one command, for trying the system on test data. Uses demo.sqlite,
    never your real pe.sqlite. Prints the admin secret the first time and saves it to
    demo-admin-secret.txt (test data only; never do this with a real database)."""
    import threading
    import webbrowser
    from pathlib import Path
    from pe.web.server import serve

    root = Path(__file__).resolve().parent.parent
    db = str(root / "demo.sqlite")
    secret_file = root / "demo-admin-secret.txt"
    fixtures = {"source_a": str(root / "tests/fixtures/source_a.json"), "source_b": str(root / "tests/fixtures/source_b.json")}
    for name, path in fixtures.items():
        sources.register(name, sources.fixture_source(path))
    conn = connect(db)
    if not conn.execute("SELECT 1 FROM settings WHERE key='admin_secret_hash'").fetchone():
        secret = admin_mod.init_admin(conn, "karan")
        secret_file.write_text(secret + "\n", encoding="utf-8")
        adm = admin_mod.authenticate(conn, secret)
        buybox.set_buy_box(conn, adm, json.loads((root / "buybox.json").read_text(encoding="utf-8")), "BENCHMARK")
        for name in fixtures:
            sources.approve_source(conn, adm, name, "test data")
    secret = secret_file.read_text(encoding="utf-8").strip() if secret_file.exists() else "(see your earlier demo run)"
    httpd, _ = serve(db, port, fixtures)
    url = f"http://127.0.0.1:{port}"
    print(f"\nDeal Desk demo is running at {url}")
    print(f"Sign in with this admin secret: {secret}")
    print("Press Ctrl+C to stop.\n")
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Stopped")


if __name__ == "__main__":
    main()
