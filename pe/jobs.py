"""Durable jobs: checkpoints, retries, idempotency, pause and cancel.

- A job is identified by an idempotency key. Submitting the same key again returns the
  existing job instead of creating a new one.
- Handlers process items one at a time and call ctx.done(item_key) after each. On retry or
  resume, finished items are skipped, so a retry never repeats work. Writes are also
  idempotent at the storage layer (unique keys), as a second line of defence.
- Pause and cancel are flags checked between items, so they take effect at the next item.
"""
import json
import traceback

from .db import audit, new_id, now, tx

HANDLERS = {}


def handler(kind):
    def wrap(fn):
        HANDLERS[kind] = fn
        return fn
    return wrap


class Stop(Exception):
    def __init__(self, status):
        self.status = status


class JobContext:
    def __init__(self, conn, job):
        self.conn = conn
        self.job_id = job["job_id"]
        self.params = json.loads(job["params_json"])
        self.checkpoint = json.loads(job["checkpoint_json"])
        self.checkpoint.setdefault("done", [])

    def is_done(self, item_key):
        return item_key in self.checkpoint["done"]

    def done(self, item_key, **extra):
        self.checkpoint["done"].append(item_key)
        self.checkpoint.update(extra)
        with tx(self.conn):
            self.conn.execute("UPDATE jobs SET checkpoint_json=?, updated_at=? WHERE job_id=?",
                              (json.dumps(self.checkpoint), now(), self.job_id))
        self.check_flags()

    def check_flags(self):
        row = self.conn.execute("SELECT pause_requested, cancel_requested FROM jobs WHERE job_id=?", (self.job_id,)).fetchone()
        if row["cancel_requested"]:
            raise Stop("cancelled")
        if row["pause_requested"]:
            raise Stop("paused")


def submit(conn, kind, params, idem_key, max_attempts=3, actor="scheduler"):
    if kind not in HANDLERS:
        raise ValueError(f"No handler for {kind}")
    with tx(conn):
        existing = conn.execute("SELECT * FROM jobs WHERE idem_key=?", (idem_key,)).fetchone()
        if existing:
            return existing["job_id"], False
        job_id = new_id("job")
        conn.execute(
            "INSERT INTO jobs(job_id,kind,idem_key,params_json,status,max_attempts,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
            (job_id, kind, idem_key, json.dumps(params), "queued", max_attempts, now(), now()),
        )
        audit(conn, actor, "job.submitted", job_id=job_id, kind=kind, idem_key=idem_key)
    return job_id, True


def _set(conn, job_id, **cols):
    cols["updated_at"] = now()
    sets = ", ".join(f"{k}=?" for k in cols)
    conn.execute(f"UPDATE jobs SET {sets}, version=version+1 WHERE job_id=?", (*cols.values(), job_id))


def run(conn, job_id):
    """Run (or resume) one job. Safe to call repeatedly."""
    with tx(conn):
        job = conn.execute("SELECT * FROM jobs WHERE job_id=?", (job_id,)).fetchone()
        if job["status"] in ("succeeded", "cancelled", "failed"):
            return job["status"]
        if job["cancel_requested"]:
            _set(conn, job_id, status="cancelled")
            return "cancelled"
        if job["pause_requested"]:
            _set(conn, job_id, status="paused")
            return "paused"
        _set(conn, job_id, status="running", attempts=job["attempts"] + 1)
    ctx = JobContext(conn, job)
    try:
        result = HANDLERS[job["kind"]](ctx)
        with tx(conn):
            _set(conn, job_id, status="succeeded", result_json=json.dumps(result or {}), last_error=None)
            audit(conn, "jobs", "job.succeeded", job_id=job_id, result=result)
        return "succeeded"
    except Stop as s:
        with tx(conn):
            _set(conn, job_id, status=s.status)
            audit(conn, "jobs", f"job.{s.status}", job_id=job_id)
        return s.status
    except Exception as e:
        attempts = conn.execute("SELECT attempts, max_attempts FROM jobs WHERE job_id=?", (job_id,)).fetchone()
        status = "retry_wait" if attempts["attempts"] < attempts["max_attempts"] else "failed"
        with tx(conn):
            _set(conn, job_id, status=status, last_error=f"{type(e).__name__}: {e}")
            audit(conn, "jobs", f"job.{status}", job_id=job_id, error=str(e), trace=traceback.format_exc()[-800:])
        return status


def run_pending(conn):
    """Worker loop body: run queued jobs and retry ones waiting to retry."""
    ids = [r["job_id"] for r in conn.execute(
        "SELECT job_id FROM jobs WHERE status IN ('queued','retry_wait') ORDER BY created_at").fetchall()]
    return {i: run(conn, i) for i in ids}


def request(conn, job_id, what, actor):
    col = {"pause": "pause_requested", "cancel": "cancel_requested"}[what]
    with tx(conn):
        conn.execute(f"UPDATE jobs SET {col}=1, updated_at=? WHERE job_id=?", (now(), job_id))
        row = conn.execute("SELECT status FROM jobs WHERE job_id=?", (job_id,)).fetchone()
        if row["status"] in ("queued", "retry_wait", "paused"):
            _set(conn, job_id, status="cancelled" if what == "cancel" else "paused")
        audit(conn, actor, f"job.{what}_requested", job_id=job_id)


def resume(conn, job_id, actor):
    with tx(conn):
        conn.execute("UPDATE jobs SET pause_requested=0, status='queued', updated_at=? WHERE job_id=? AND status='paused'",
                     (now(), job_id))
        audit(conn, actor, "job.resumed", job_id=job_id)


# Scheduling: a schedule submits a job with a time-bucketed idempotency key, so a
# scheduler tick that fires twice in the same window cannot create two runs.
def add_schedule(conn, admin, name, kind, params, every_minutes):
    with tx(conn):
        conn.execute("INSERT OR REPLACE INTO schedules(name,kind,params_json,every_minutes,enabled) VALUES (?,?,?,?,1)",
                     (name, kind, json.dumps(params), every_minutes))
        audit(conn, admin.name, "schedule.set", name=name, every_minutes=every_minutes)


def tick(conn, at_epoch_minutes):
    submitted = []
    for s in conn.execute("SELECT * FROM schedules WHERE enabled=1").fetchall():
        bucket = at_epoch_minutes // s["every_minutes"]
        job_id, created = submit(conn, s["kind"], json.loads(s["params_json"]), f"sched:{s['name']}:{bucket}")
        if created:
            submitted.append(job_id)
    return submitted
