# Hosted activation and acceptance

## Verified on November 14, 2026

Project `ymbciapnzdmymtthevjp` remains on the Free plan. All 22 remaining migrations were applied individually in order. The hosted ledger has 23 entries, including the previously applied worker migration. Foundation 001 and scheduler 002 were already active and were not rerun. Exact source checksums and recorded versions are in [the activation record](../production/activation/2026-11-14.json).

All 57 Kalling tables have RLS enabled. The four buckets, `kalling-private`, `kalling-portal`, `kalling-buyer-proof` and `kalling-execution`, are nonpublic. The byte-validation Edge Function is deployed with platform JWT verification enabled and an additional confirmed-user check in its handler. Its server-provided administrative credential stays inside Supabase; no secret key was retrieved or added to the app, worker or repository.

The rollback-only database smoke test passed 13 checks against hosted PostgreSQL: the engagement gate, reservation and storage policies, accepted source documents, owner memorandum approval, anonymous listing, NDA approval, logged reads, signed-link refusal, owner/buyer revocation, account isolation, worker versions, interrupted lease recovery and the local-only result contract. These tests exercise hosted SQL policies using explicitly assigned test identities and Storage metadata. They do not issue Auth sessions or transfer object bytes.

Immediately after the rollback-only smoke check there were zero firms, portals, jobs, paired workers and Kalling storage objects. The subsequent authenticated run retained two private fictional firms and one small test file. The brokerage house remains unset, so the public brokerage cannot accept real intake. Nothing was emailed or sent to a model. Attorney review, licensing, fees, SMTP, contact information and public launch setup remain open.

Eight direct HTTPS checks passed: Auth health, invalid-token refusal, anonymous firm isolation, anonymous execution/calibration denial, private-schema refusal, unauthenticated validator refusal, and the GitHub Pages CORS preflight. These are negative access checks, not authenticated file-transport acceptance.

## Authenticated firm and private-file acceptance

Karan created the six fictional test accounts manually and ran the checked script on his Mac. His terminal output reports all **24 authenticated checks passed**, using runner commit `75ba1d3711cb6bdd5914b3ca734ad72c555caccf`. This includes all six password grants and verified user lookups, cross-account workspace isolation, invitation acceptance, actual original-file upload/download with matching SHA-256 for the owner and analyst, overwrite refusal, known-object refusal for unrelated parties, immediate role downgrade and revocation with the existing JWT, and Auth refresh. Credentials were entered through the hidden prompt; they were not shared in chat or committed.

A separate read-only hosted check at `2026-11-14T19:30:16Z` confirmed all six test users had signed in, exactly two matching fictional firms, one stored test file whose byte count and MIME metadata match its reservation, the member inactive with role `viewer`, no active membership for that member in the test firms, zero remaining test Auth sessions, and zero brokerage-house settings. Audit totals match two firm creations, one invitation and acceptance, one file reservation and storage, and two membership changes. This corroborates the retained state; the SHA-256 and HTTP denials were checked by the local runner, not re-derived from SQL metadata.

The local JSON report remains in Karan's Downloads folder. Only the supplied terminal outcome and sanitized hosted confirmation are recorded here; the complete local report has not been imported.

The six role names are owner_a, owner_b, member, seller, buyer and specialist. Their emails use `owner-a-20261114`, `owner-b-20261114`, `member-20261114`, `seller-20261114`, `buyer-20261114` and `specialist-20261114` at `kalling-validation.invalid`. Confirm only these fictional users through administrative controls. Do not disable email confirmation, configure SMTP, send email invitations, use a real person's address or change an existing account. Keep credentials out of chat and version control.

The runner uses the existing publishable key only. It refuses other projects, privileged keys, real email domains, repeated identities, short credentials, files inside the repository and credentials files readable by other users. HTTP calls have a 20-second limit. It prints check names, never passwords or tokens.

From `demo/`, install the locked dependencies before running the script:

```sh
npm ci
```

Then run the read-only checks with:

```sh
node --experimental-strip-types scripts/hosted-validation.mjs doctor --output /tmp/kalling-hosted-doctor.json
```

For the authenticated run, use the hidden Terminal prompts. Type or paste the password that you created for each named account, then press Return. No characters or stars appear while you type. Passwords stay in memory for this run; they are not written to a file, printed or included in the report. Ctrl+C cancels. All six credentials are collected before any login or test writes. All six logins must then succeed before any firms or files are created. Explicitly opt into the fictional test writes:

```sh
node --experimental-strip-types scripts/hosted-validation.mjs run --confirm-fictional --prompt --output "$HOME/Downloads/kalling-hosted-acceptance.json"
```

Alternatively, prepare a private JSON file outside the repository. Its six keys match the role names above; each value has an `email` and `password` for that newly confirmed fictional user. Restrict the file with `chmod 600` on the Mac. Choose one credential method per run:

```sh
node --experimental-strip-types scripts/hosted-validation.mjs run --confirm-fictional --accounts /absolute/private/path/accounts.json --output /tmp/kalling-hosted-acceptance.json
```

The runner verifies password grants, confirmed user lookups, two private firms, known workspace isolation, an accepted analyst invitation, actual immutable original-file upload/download with matching SHA-256, refusal for unrelated parties, role downgrade and revocation using the existing JWT, and Auth refresh. It signs out the fictional sessions afterward. It never configures the brokerage house or sends email. Private fictional fixtures remain for inspection; the report records IDs and object paths for a separately reviewed cleanup. A failed run is reported as failed, not repaired by bypassing policies.

The completed run covers the firm workspace and `kalling-private` bucket. Authenticated owner-portal uploads, buyer proof-file upload and validator attestation, buyer data-room reads, execution diligence files and post-close handover over HTTP remain unverified. The hosted SQL smoke checks the data-room ticket policy separately. SMTP delivery, a connected nonempty background job and public launch also remain outside this acceptance result. Do not extend the 24-check result to those workflows.

## Owner-portal upload acceptance

The next runner is `scripts/hosted-owner-uploads.mjs`. It requires the successful foundation report already saved in Karan's Downloads folder. Before any test writes, it verifies all six confirmed identities, the exact fictional firm names and owners, and that every company in the reused workspace is marked as a sample. It reuses those two firms, adds one fictional company and portal, and records the retained fixtures in a separate report. It never configures a brokerage house, emails a recipient or calls a model.

The acceptance protocol covers the unsigned engagement gate through direct RPC and known-object requests; both fictional signatures; retry before upload and after byte arrival; matching downloaded bytes; deduplication; immutable originals; unrelated-party refusal; signed-link refusal; read-only membership and immediate revocation; changed-attachment review invalidation; and owner-email changes. A successful run closes its test portal and revokes the test viewer. Six hidden password prompts use the existing confirmed fictional accounts. No password file is needed.

From the checked-out review branch's `demo/` folder, after `npm ci`:

```sh
node --experimental-strip-types scripts/hosted-owner-uploads.mjs run --confirm-fictional --prompt --foundation-report "$HOME/Downloads/kalling-hosted-acceptance.json" --output "$HOME/Downloads/kalling-owner-upload-acceptance.json"
```

An interrupted or failed run may leave private partial fixtures. Its report records known fixture IDs, and a subsequent run first revokes the same fictional viewer before creating another sample company. Retain the reports for reviewed cleanup; do not rerun the foundation runner merely to repeat portal checks. All logins must succeed before any fixture changes. The complete owner-upload protocol is exercised locally against PostgreSQL with simulated Auth/byte transport; that local test is not hosted HTTP evidence. Actual hosted owner-portal transport remains pending Karan's local run.

The replacement-document smoke test separately checks owner reapproval and rejection of the previous buyer ticket inside a rollback-only SQL transaction. It transfers no file bytes, and its temporary house configuration is never visible outside that transaction. Buyer proof-file attestation, buyer data-room HTTP transport, closing-file handover, real Mac inference and the complete hosted mobile rehearsal remain subsequent steps.

## Advisory findings

The health advisor reports no findings. Security notices remain for deliberate default-deny tables and checked SECURITY DEFINER RPCs. Worker endpoints authenticate bounded worker tokens; public lead intake and case-study queries have explicit application gates. These notices have not been dismissed or described as an independent security audit. See the [no-policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [anonymous RPC](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated RPC](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) guidance.

Production review must also consider password protections, foreign-key indexing and RLS query planning. No billing, plan or Auth setting was changed. Detailed live advisory output belongs in the private operational record.
