# Phase 3 activation and validation

The financial-integrity fix preserves accepted, edited and skipped earnings lines and uses the saved recast in the memorandum. Financial citations include the actual file, page and excerpt. An updated recast or source set requires a new draft and fresh approvals. Amounts, signs and accounting years are checked in the worker and again in the advisor's browser.

The data-room revocation migration checks current permissions for every authenticated file fetch, including fetches using an existing ticket. Buyers cannot use tickets to create signed URLs or list the bucket. Client-side watermarks remain a sharing deterrent; they do not remove the buyer's access to bytes already delivered.

## Database activation

The hosted project already has the foundation and scheduler. Preserve those tables, policies and cron schedules. Apply the following in order, or in one atomic transaction preserving this order:

1. `003_agent_workers.sql`
2. `004_owner_portal.sql`
3. `005_brokerage.sql`
4. `006_buyer_checks.sql`
5. `007_drafting_jobs.sql`
6. `008_listing_anonymity.sql`
7. `009_data_room.sql`
8. `010_engagement_letters.sql`
9. `011_owner_reviews.sql`
10. `20261113032739_kalling_dataroom_revocation.sql`

Before applying, inspect the hosted tables and migration history. Do not reapply a migration whose objects already exist. The revocation migration requires the current Supabase `storage.allow_only_operation` helper. Never use a service-role or secret key in the browser or worker.

## Rollback-only fictional smoke test

Run `production/tests/phase3-smoke.sql` as postgres after activation, before configuring the real house firm. The same SQL runs in `production/tests/phase3Smoke.test.mjs` after applying all migrations in order. It:

* creates fictional confirmed identities with random IDs and `.invalid` emails inside a subtransaction;
* verifies the engagement gate before and after both signatures;
* reserves and registers a fictional file through seller RLS, accepts it and stores private extracted text;
* tests owner memorandum approval and an anonymous listing;
* tests per-listing NDA approval, logged document fetches, denied link signing, and immediate storage denial following buyer restriction or owner withdrawal;
* verifies an unrelated account cannot read the portal, workspace or confidential listing;
* tests the worker version gate, same-lease recovery and the local-only result contract;
* deliberately rolls back every fixture, signature, invitation, worker, ticket, job and test house setting on success.

The final query returns `status: passed` and `fixtures_retained: false` only if all assertions complete. Any unexpected error aborts the test. No Auth invitation emails are sent, no model is contacted, and no real user's identity or settings are changed. The storage fixture tests PostgreSQL metadata and RLS, not an actual object-store transfer. Real Mac inference and hosted upload/download transport require a separate connected-session check.

## Remaining setup

The firm owner must create or select the real advisor firm and call `public.kalling_brokerage_set_house('<firm id>')` while signed in. The smoke test intentionally does not leave a fictional firm in charge of the brokerage. This one-time setting requires the selected firm's owner.

Update the Mac worker from the current repository and reinstall it with `node --experimental-strip-types scripts/kalling-worker.mjs install` from `demo/`. Pair it in the advisor workspace. Keep Ollama cloud features disabled. The hosted worker queue can be validated without running a model; that does not prove the Mac is connected or a real inference succeeded.

Attorney review, NJ/NY licensing confirmation, the fee decision and SMTP remain open. Nothing in database activation marks them complete or enables automatic communications.
