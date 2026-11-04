"""Authenticated admin path. Policy changes (buy box, identity mapping, budgets, approvals)
require an Admin object, which can only be created by presenting the admin secret.
Nothing that arrives from Slack, email or a website can create one.
"""
import hashlib
import hmac
import os
import secrets

from .db import audit, tx


class Admin:
    def __init__(self, name, _token):
        if _token is not _ISSUED:
            raise PermissionError("Use authenticate()")
        self.name = name


_ISSUED = object()


def _hash(secret):
    return hashlib.sha256(secret.encode()).hexdigest()


def init_admin(conn, name):
    """One-time setup. Returns the secret to store outside the database (e.g. a password manager)."""
    if conn.execute("SELECT 1 FROM settings WHERE key='admin_secret_hash'").fetchone():
        raise PermissionError("Admin already initialized")
    secret = secrets.token_urlsafe(24)
    with tx(conn):
        conn.execute("INSERT INTO settings VALUES ('admin_secret_hash', ?)", (_hash(secret),))
        conn.execute("INSERT INTO settings VALUES ('admin_name', ?)", (name,))
        audit(conn, name, "admin.initialized")
    return secret


def authenticate(conn, secret=None):
    secret = secret or os.environ.get("PE_ADMIN_SECRET", "")
    row = conn.execute("SELECT value FROM settings WHERE key='admin_secret_hash'").fetchone()
    name = conn.execute("SELECT value FROM settings WHERE key='admin_name'").fetchone()
    if not row or not secret or not hmac.compare_digest(row["value"], _hash(secret)):
        audit(conn, "unknown", "admin.auth_failed")
        raise PermissionError("Admin authentication failed")
    return Admin(name["value"], _ISSUED)
