# Kalling production foundation — free-tier pilot

Mission: Kalling helps a small acquisition team find, evaluate, acquire, and operate businesses—with agents doing the preparation and people owning the decisions.

## Activation state

**November 14, 2026:** all remaining migrations are applied. Hosted PostgreSQL rollback checks, eight unauthenticated HTTPS checks and 24 real authenticated firm/private-file checks passed. The local run proves actual upload/download, cross-account isolation and same-JWT membership revocation for `kalling-private`. Its retained state was independently confirmed through read-only hosted queries. Other portal, proof-file, data-room and execution-file HTTP workflows remain unverified. The brokerage house remains unset and public intake is unavailable. See [the current validation report](../docs/hosted-validation.md) and [migration ledger](activation/2026-11-14.json). This supersedes the earlier activation notes below.

This folder contains executable PostgreSQL migrations and isolation/queue tests. The frontend exposes **Accounts & cloud** in the sidebar. The Kalling Free project is provisioned and the foundation tables, private buckets and database scheduler are active. The hosted app includes only its public connection settings. Real fictional-account login, refresh and firm original-file transport have passed acceptance. A connected nonempty background job and the remaining portal/marketplace/execution file workflows still need authenticated acceptance. The GitHub Pages demo continues working locally without any project or credentials. Never describe publishing the frontend as activating the backend.

## Zero-cost architecture

- GitHub Pages serves the existing React frontend.
- Supabase Free supplies Auth, PostgreSQL and a private Storage bucket.
- Supabase Cron runs one bounded database worker each minute; no additional always-on worker service or paid model calls.
- The only registered handler, `workspace.audit`, checks company/deal references in saved workspace records. This is not an AI agent, financial review, or malware scanner.
- Free projects can pause after inactivity. There is no production uptime promise. Stay on the Free organization plan; do not add paid services or upgrade automatically.

At implementation time the free allowance was 500 MB database and 1 GB files. Check https://supabase.com/pricing before activation. Limits below reduce accidental use but are not a guarantee that all customers together fit the provider quota. Provider usage must be monitored. No credit card is required by this code.

## Activate on a dedicated Free project

1. Create/select a dedicated **Free** Supabase project. Do not apply these migrations to an unrelated application. Keep email confirmation enabled. Configure strong passwords (at least 12 characters), reasonable auth rate limits and the exact frontend Site URL / redirect allowlist. Use the GitHub Pages URL returned by deployment, including `/pe-agents/`.
2. Apply `migrations/001_foundation.sql` once as `postgres`, then `migrations/002_scheduler.sql`. Supabase Cron is `pg_cron`; the second migration adds only two named jobs. Apply the additive `migrations/20261108215809_kalling_invitation_rls.sql` hardening migration as well: it explicitly enables invitation-table RLS and revokes direct client grants. On the live Kalling project these protections were already verified after using the SQL editor’s Run and enable RLS option. Migration 001 creates tables, fixed-path functions, role grants, policies and the **nonpublic** `kalling-private` bucket. Do not reapply an already-applied migration; append changes instead. Then apply `migrations/003_agent_workers.sql` to enable connected research computers (see `docs/research-computer.md`). Apply `migrations/004_owner_portal.sql` for the owner portal (see `docs/owner-portal.md`). Apply `migrations/005_brokerage.sql` for the public HVAC marketplace (see `docs/brokerage.md`).
3. Provision the initial verified test account in the Supabase Auth dashboard, or configure confirmation email delivery before using Create account. Supabase's default email service is limited and may only deliver to project-team addresses. External onboarding and password recovery need a configured email provider; no paid provider or outbound messages are configured here. Use the dashboard for pilot account recovery until email delivery is configured. Do not disable email verification to bypass this limitation.
4. In **Accounts & cloud**, enter the project HTTPS URL and **publishable** key (or legacy `anon` key). These are public connection settings, not admin credentials. The app rejects service-role / secret keys. No service-role key is needed in the browser, GitHub repository or this implementation's scheduler.
5. Sign in, create an empty firm, and open it. Records save to PostgreSQL rather than browser workspace storage. Add a company before uploading originals in **Account, files & jobs → Private files**. Existing local records are not silently copied into cloud storage.
6. Queue a record-reference check. Close the browser, wait for the next minute, reopen it, and verify the persisted result and worker timestamp. If no worker timestamp appears, inspect Supabase Cron; the page never runs the worker itself.

Project URL and publishable key are stored per device. Auth sessions use Supabase's standard SPA session persistence and refresh. Workspace JSON and file bytes are not cached by this app in browser localStorage. The local demo has its own existing storage key. Auth tokens still require normal browser security; this is not an HTTP-only-cookie backend.

## Access and storage model

- Firm membership is stored server-side and checked from `auth.uid()` on every read/write. Four real account roles: owner, admin, analyst, viewer. Workflow responsibility names and recorded review labels remain distinct from authenticated identity.
- All tenant tables use RLS. Ordinary clients have SELECT only; bounded SECURITY DEFINER RPCs handle writes with an empty search path and explicit access checks. Anonymous execution is revoked. Clients cannot self-insert membership, forge audit events, or update queue state directly.
- The creating owner cannot be removed/demoted through these RPCs. Only the owner can grant or change administrator access. Analysts can edit, upload and enqueue; viewers can read/download only. Role changes and revocation are server-enforced even if a stale UI shows an older role.
- Invitations are random, SHA-256 hashed at rest, single-use, verified-email bound, revocable, and expire in seven days. Accepting also rechecks the inviter's current authority. No invitation email is sent by the app. Revoking/changing a member invalidates unused invitations for that email; workers cancel work from requesters who lose write access.
- Original files use server-reserved opaque paths and immutable uploads, no public URLs or app-issued reusable signed links. Downloads use the current authenticated Storage API and current membership. Previously downloaded bytes cannot be recalled after revocation.
- Original-file revisions link only to a prior document belonging to the same firm/company. Storage metadata must match reserved size/type before finalization. Incomplete reservations remain visible and occupy a pilot slot; uploaded-but-unfinalized files can be finalized through the interface. Orphan reservation cleanup and malware scanning are not implemented. No files are executed.
- Existing brief uploads extract source text into the workspace. Original files are stored separately through Private files. Storing an original does not yet trigger document extraction or brief creation. Company-level/external-advisor permissions are not implemented; each member can read the entire firm.

## Durable jobs and concurrent edits

`kalling_enqueue_job` stores an idempotent firm-scoped job. Claims use `FOR UPDATE SKIP LOCKED`, expiring leases, attempt limits and fencing tokens. Stale/cancelled leases cannot complete jobs. Failure uses bounded exponential retry; terminal failure remains inspectable. The scheduler serializes ticks using an advisory transaction lock and executes at most five database-only checks per tick. The database transaction makes current handlers atomic. Longer network/model handlers must be implemented separately with persistent checkpoints, idempotent side effects and explicit budgets; adding a new kind is intentionally blocked today.

Workspace edits require the expected revision. A conflicting write fails rather than overwriting a colleague's data. The UI retains an export of the attempted unsaved state; do not blindly retry it over a newer revision. Server audit events identify the authenticated actor. Application business-review labels are not verified signatures. There is no live coediting or realtime merge yet.

## Pilot bounds and retention

- 3 created firms per user.
- 5,000 companies and 2 MB serialized workspace per firm.
- Last 10 complete workspace revisions retained; server metadata audit is append-only. Export older full snapshots if needed.
- 20 file reservations/originals per firm, each up to 5 MB, including unfinished uploads; 100 MB declared storage cap. No object overwrites or client deletion.
- 20 pending invitations per firm.
- 25 new jobs per firm per day; terminal queue rows retained 30 days; worker cron logs retained 7 days. The metadata audit retains job IDs/status events; it does not retain full result payloads indefinitely.

These controls favor a bounded internal pilot. Free hosting is not a substitute for a tested backup/restore procedure. Before real customer diligence, verify database exports, separately export/download original files, store backups outside the project and rehearse restoration. Free-plan backup availability should not be assumed. Data-retention/deletion requests currently require administrator handling. MFA, stronger approval separation, file scanning, independently audited security and customer-specific retention are later production-hardening work.

## Verification

Run from `demo/`:

```sh
npm ci
npm test
npm run build
```

`production/tests/foundation.test.mjs` executes migration 001 against real PostgreSQL compiled to WASM (PGlite), with small stand-ins for Supabase's Auth identity and Storage metadata contracts. It switches database roles to exercise tenant isolation, privilege escalation, read-only accounts, invitation controls, original-file access, optimistic locking, lease fencing, retries and revocation. It does **not** validate hosted JWT issuance, email delivery, actual Storage transport, simultaneous independent database connections or pg_cron timing.

Hosted acceptance must include two separate accounts/firms: cross-firm reads and guessed object paths fail; revoked membership loses database/file access; stale writes fail; original bytes survive a new device/session; and queued work completes with all browsers closed. Do not mark cloud activation verified until these checks pass against the selected project.

## Stop the scheduler

As the project administrator, disable the two named jobs in Supabase Cron, or execute:

```sql
select cron.unschedule('kalling-foundation-worker');
select cron.unschedule('kalling-foundation-log-retention');
```

This stops execution without deleting firm records or stored files. The frontend can still inspect queued status. No deployment secret or billing change is needed.

## Live project verification · November 8, 2026

The project `ymbciapnzdmymtthevjp` is in US East under the Kalling Free organization, with creation quoted at $0/month. All nine Kalling tables have RLS enabled; invitation records have no direct anon/authenticated read grants; the original-file bucket is nonpublic and limited to 5 MB per object. Both named cron schedules are active and a database worker tick was observed. Public privileged RPCs have no anonymous execution grant.

The security advisor reports an informational no-policy finding for the invitation table: default-deny is intentional because only checked server functions manage invitations. It also flags the authenticated SECURITY DEFINER write RPCs for review. Those are intentional privileged entrypoints with explicit authorization checks and fixed search paths, covered by role-isolation tests; this is not an independent security audit. Do not describe all advisor findings as cleared.

The frontend uses the public project URL and publishable key automatically. Device overrides and explicit disconnect remain available. The default Auth email service requires confirmation and is suitable only for limited internal testing. In Supabase Authentication → URL Configuration, set the Site URL and allowed redirect URL to the exact deployed frontend URL before onboarding; the connector cannot change those settings. Hosted login, file uploads/downloads, and a nonempty background job have not yet been verified with a real signed-in account.
