"""Storage: one SQLite file (portable schema; Postgres is the deployment target).

Design rules enforced here, not in prompts:
- Shared deal facts are append-only rows with evidence; nothing is overwritten in place.
- Mutable records (deals, jobs, actions, identities) carry a `version` and every change
  writes a snapshot to `history`. Updates must name the version they read (optimistic lock).
- There are no delete helpers. Destructive edits are not exposed to agents at all.
"""
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS buy_box (
  version INTEGER PRIMARY KEY AUTOINCREMENT,
  criteria_json TEXT NOT NULL,
  label TEXT NOT NULL,              -- e.g. 'TEST' until the user supplies a real one
  created_by TEXT NOT NULL,         -- always a human admin
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deals (
  deal_id TEXT PRIMARY KEY,         -- stable: derived from the normalized business key
  normalized_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'sourced',
  handoff_state TEXT NOT NULL DEFAULT 'new',
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  listing_id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(deal_id),
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  posted_at TEXT,
  retrieved_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL,           -- untrusted content, stored as data only
  flags_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(source, external_id, content_hash)
);

CREATE TABLE IF NOT EXISTS facts (
  fact_id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(deal_id),
  field TEXT NOT NULL,
  value_json TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('reported','calculated','assumption')),
  source_url TEXT,
  retrieved_at TEXT,
  evidence TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (          -- private working notes, never shown as facts
  note_id TEXT PRIMARY KEY,
  deal_id TEXT,
  agent TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  question_id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS screenings (
  screening_id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  buy_box_version INTEGER NOT NULL,
  input_hash TEXT NOT NULL,
  results_json TEXT NOT NULL,
  overall TEXT NOT NULL CHECK (overall IN ('pass','fail','unknown')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(deal_id, buy_box_version, input_hash)
);

CREATE TABLE IF NOT EXISTS models (
  model_id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  buy_box_version INTEGER NOT NULL,
  input_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(deal_id, buy_box_version, input_hash)
);

CREATE TABLE IF NOT EXISTS jobs (
  job_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  idem_key TEXT NOT NULL UNIQUE,
  params_json TEXT NOT NULL,
  status TEXT NOT NULL,             -- queued|running|retry_wait|succeeded|failed|paused|cancelled
  checkpoint_json TEXT NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  pause_requested INTEGER NOT NULL DEFAULT 0,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  name TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  params_json TEXT NOT NULL,
  every_minutes INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT
);

CREATE TABLE IF NOT EXISTS actions (          -- anything that leaves the system
  action_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,               -- email_outreach|listing_response|slack_reply|paid_service|meeting_request
  payload_json TEXT NOT NULL,
  audience_json TEXT NOT NULL,
  status TEXT NOT NULL,             -- pending|approved|rejected|executed|blocked
  requested_by TEXT NOT NULL,
  idem_key TEXT NOT NULL UNIQUE,
  cost_estimate REAL NOT NULL DEFAULT 0,
  decided_by TEXT,
  decided_at TEXT,
  executed_at TEXT,
  result TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  category TEXT PRIMARY KEY,        -- e.g. 'model', 'enrichment'
  monthly_limit REAL NOT NULL,
  auto_approve INTEGER NOT NULL,    -- 1 = routine spend inside the limit needs no per-call approval
  configured_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spend (
  spend_id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  month TEXT NOT NULL,
  idem_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  actor TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  event TEXT NOT NULL,
  detail_json TEXT NOT NULL
);

-- Slack owner app ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  company_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK (relationship IN ('prospect','portfolio'))
);

CREATE TABLE IF NOT EXISTS contacts (
  contact_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(company_id),
  name TEXT NOT NULL,
  email TEXT
);

CREATE TABLE IF NOT EXISTS identities (
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  contact_id TEXT NOT NULL REFERENCES contacts(contact_id),
  company_id TEXT NOT NULL REFERENCES companies(company_id),
  role TEXT NOT NULL CHECK (role IN ('prospect_owner','portfolio_operator')),
  status TEXT NOT NULL CHECK (status IN ('active','revoked')),
  verified_by TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS internal_users (     -- our own team members allowed in channels
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS channels (
  channel_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(company_id),
  audience TEXT NOT NULL,
  configured_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approved_content (
  content_id TEXT PRIMARY KEY,
  company_id TEXT,                  -- NULL = applies to every company
  audience TEXT NOT NULL CHECK (audience IN ('prospect_owner','portfolio_operator','all_owners')),
  kind TEXT NOT NULL CHECK (kind IN ('faq')),
  question TEXT NOT NULL,
  keywords TEXT NOT NULL,
  answer TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS submissions (
  submission_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  kind TEXT NOT NULL,               -- company_update|document|meeting_request|question
  body TEXT NOT NULL,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  verification TEXT NOT NULL DEFAULT 'unverified',
  slack_ts TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS slack_events (
  event_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  convo_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  thread_ts TEXT NOT NULL,
  audience TEXT NOT NULL,
  UNIQUE(company_id, channel_id, thread_ts)
);

CREATE TABLE IF NOT EXISTS messages (
  message_id TEXT PRIMARY KEY,
  convo_id TEXT NOT NULL REFERENCES conversations(convo_id),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  user_id TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
"""


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def connect(path):
    conn = sqlite3.connect(path, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


@contextmanager
def tx(conn):
    """Immediate transaction: takes the write lock up front so concurrent writers serialize."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def audit(conn, actor, event, **detail):
    conn.execute(
        "INSERT INTO audit(at, actor, event, detail_json) VALUES (?,?,?,?)",
        (now(), actor, event, json.dumps(detail, default=str)),
    )


def snapshot(conn, table, key_col, row_id, actor):
    row = conn.execute(f"SELECT * FROM {table} WHERE {key_col}=?", (row_id,)).fetchone()
    conn.execute(
        "INSERT INTO history(table_name,row_id,version,snapshot_json,actor,at) VALUES (?,?,?,?,?,?)",
        (table, row_id, row["version"], json.dumps(dict(row)), actor, now()),
    )


class ConflictError(Exception):
    """The record changed since it was read; reload and retry."""
