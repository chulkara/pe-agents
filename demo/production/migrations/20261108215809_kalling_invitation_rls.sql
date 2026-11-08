-- Invitation records remain server-managed. No direct client policy is intentional.
-- Additive hardening for existing installs; safe when the SQL editor already enabled RLS.
alter table kalling_private.invites enable row level security;
revoke all on table kalling_private.invites from public, anon, authenticated;
