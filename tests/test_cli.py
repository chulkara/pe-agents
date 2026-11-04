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
