import json

from pe import cli
from pe.db import connect


def test_adhoc_runs_never_collapse_into_one_job(tmp_path, monkeypatch):
    db = str(tmp_path / "c.sqlite")
    monkeypatch.setenv("PE_DB", db)
    cli.main(["--db", db, "screen"])
    cli.main(["--db", db, "screen"])  # same second: must still be a separate run
    assert connect(db).execute("SELECT COUNT(*) c FROM jobs").fetchone()["c"] == 2
    cli.main(["--db", db, "screen", "--key", "k1"])
    cli.main(["--db", db, "screen", "--key", "k1"])  # explicit key: idempotent
    assert connect(db).execute("SELECT COUNT(*) c FROM jobs").fetchone()["c"] == 3


def test_demo_command_sets_up_and_serves(tmp_path, monkeypatch):
    import threading, http.client, json as _j
    from pathlib import Path
    from pe.web import server
    started = {}
    real_serve = server.serve

    def fake_serve(db, port, fixtures):
        httpd, app = real_serve(db, 0, fixtures)
        started["port"] = httpd.server_address[1]
        httpd.serve_forever = lambda: started.setdefault("db", db)
        return httpd, app
    monkeypatch.setattr(server, "serve", fake_serve)
    monkeypatch.setattr("webbrowser.open", lambda url: None)
    root = Path(cli.__file__).resolve().parent.parent
    for f in ("demo.sqlite", "demo.sqlite-wal", "demo.sqlite-shm", "demo-admin-secret.txt"):
        (root / f).unlink(missing_ok=True)
    try:
        cli.main(["demo"])
        conn = connect(started["db"])
        assert conn.execute("SELECT label FROM buy_box").fetchone()[0] == "BENCHMARK"
        assert (root / "demo-admin-secret.txt").read_text().strip()
        cli.main(["demo"])  # second run reuses setup
        assert conn.execute("SELECT COUNT(*) FROM buy_box").fetchone()[0] == 1
    finally:
        for f in ("demo.sqlite", "demo.sqlite-wal", "demo.sqlite-shm", "demo-admin-secret.txt"):
            (root / f).unlink(missing_ok=True)
