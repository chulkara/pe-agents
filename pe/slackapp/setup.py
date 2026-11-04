"""Admin-only configuration for the Slack owner app. Every function requires an
authenticated Admin; nothing here is reachable from a Slack message.
"""
from ..admin import Admin
from ..db import audit, new_id, now, snapshot, tx

ROLES = ("prospect_owner", "portfolio_operator")


def _admin(a):
    if not isinstance(a, Admin):
        raise PermissionError("Admin authentication required")


def add_company(conn, admin, company_id, name, relationship):
    _admin(admin)
    with tx(conn):
        conn.execute("INSERT INTO companies VALUES (?,?,?)", (company_id, name, relationship))
        audit(conn, admin.name, "company.added", company_id=company_id, relationship=relationship)


def add_contact(conn, admin, contact_id, company_id, name, email):
    _admin(admin)
    with tx(conn):
        conn.execute("INSERT INTO contacts VALUES (?,?,?,?)", (contact_id, company_id, name, email))
        audit(conn, admin.name, "contact.added", contact_id=contact_id, company_id=company_id)


def map_identity(conn, admin, team_id, user_id, contact_id, role, verification_method):
    """Bind a Slack (team, user) to a verified contact. verification_method must say how
    ownership was confirmed out of band (e.g. 'video call + email from known address')."""
    _admin(admin)
    if role not in ROLES:
        raise ValueError(role)
    if not verification_method or len(verification_method) < 8:
        raise ValueError("Describe how this person was verified")
    company = conn.execute("SELECT company_id FROM contacts WHERE contact_id=?", (contact_id,)).fetchone()
    with tx(conn):
        conn.execute(
            "INSERT INTO identities(team_id,user_id,contact_id,company_id,role,status,verified_by,verification_method,updated_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (team_id, user_id, contact_id, company["company_id"], role, "active", admin.name, verification_method, now()))
        snapshot(conn, "identities", "team_id||':'||user_id", f"{team_id}:{user_id}", admin.name)
        audit(conn, admin.name, "identity.mapped", team_id=team_id, user_id=user_id, contact_id=contact_id, role=role)


def revoke_identity(conn, admin, team_id, user_id):
    _admin(admin)
    with tx(conn):
        conn.execute("UPDATE identities SET status='revoked', version=version+1, updated_at=? WHERE team_id=? AND user_id=?",
                     (now(), team_id, user_id))
        snapshot(conn, "identities", "team_id||':'||user_id", f"{team_id}:{user_id}", admin.name)
        audit(conn, admin.name, "identity.revoked", team_id=team_id, user_id=user_id)


def add_internal_user(conn, admin, team_id, user_id):
    _admin(admin)
    with tx(conn):
        conn.execute("INSERT OR IGNORE INTO internal_users VALUES (?,?)", (team_id, user_id))
        audit(conn, admin.name, "internal_user.added", user_id=user_id)


def configure_channel(conn, admin, channel_id, company_id, audience):
    _admin(admin)
    if audience not in ROLES:
        raise ValueError(audience)
    with tx(conn):
        conn.execute("INSERT OR REPLACE INTO channels VALUES (?,?,?,?)", (channel_id, company_id, audience, admin.name))
        audit(conn, admin.name, "channel.configured", channel_id=channel_id, company_id=company_id, audience=audience)


def add_faq(conn, admin, company_id, audience, question, keywords, answer):
    """Approved content. company_id=None means it applies to every company for that audience."""
    _admin(admin)
    with tx(conn):
        cid = new_id("faq")
        conn.execute("INSERT INTO approved_content(content_id,company_id,audience,kind,question,keywords,answer,approved_by)"
                     " VALUES (?,?,?,?,?,?,?,?)", (cid, company_id, audience, "faq", question, ",".join(keywords), answer, admin.name))
        audit(conn, admin.name, "faq.approved", content_id=cid, company_id=company_id, audience=audience)
    return cid


def purge_message_bodies(conn, admin, older_than_days):
    """Retention: blank stored message text after N days. Audit entries are kept."""
    _admin(admin)
    with tx(conn):
        cur = conn.execute("UPDATE messages SET body='[purged]' WHERE created_at < datetime('now', ?) AND body<>'[purged]'",
                           (f"-{int(older_than_days)} days",))
        audit(conn, admin.name, "messages.purged", count=cur.rowcount, older_than_days=older_than_days)
    return cur.rowcount
