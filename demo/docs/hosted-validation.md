# Hosted activation and acceptance

## Verified on November 14, 2026

Project `ymbciapnzdmymtthevjp` remains on the Free plan. All 22 remaining migrations were applied individually in order. The hosted ledger has 23 entries, including the previously applied worker migration. Foundation 001 and scheduler 002 were already active and were not rerun. Exact source checksums and recorded versions are in [the activation record](../production/activation/2026-11-14.json).

All 57 Kalling tables have RLS enabled. The four buckets, `kalling-private`, `kalling-portal`, `kalling-buyer-proof` and `kalling-execution`, are nonpublic. The byte-validation Edge Function is deployed with platform JWT verification enabled and an additional confirmed-user check in its handler. Its server-provided administrative credential stays inside Supabase; no secret key was retrieved or added to the app, worker or repository.

The rollback-only database smoke test passed 13 checks against hosted PostgreSQL: the engagement gate, reservation and storage policies, accepted source documents, owner memorandum approval, anonymous listing, NDA approval, logged reads, signed-link refusal, owner/buyer revocation, account isolation, worker versions, interrupted lease recovery and the local-only result contract. These tests exercise hosted SQL policies using explicitly assigned test identities and Storage metadata. They do not issue Auth sessions or transfer object bytes.

After rollback there are still zero firms, portals, jobs, paired workers and Kalling storage objects. Existing Auth accounts are unchanged. The brokerage house remains unset, so the public brokerage cannot accept real intake. Nothing was emailed or sent to a model. Attorney review, licensing, fees, SMTP, contact information and public launch setup remain open.

Eight direct HTTPS checks passed: Auth health, invalid-token refusal, anonymous firm isolation, anonymous execution/calibration denial, private-schema refusal, unauthenticated validator refusal, and the GitHub Pages CORS preflight. These are negative access checks, not authenticated file-transport acceptance.

## Remaining authenticated checks

Dashboard authentication is paused pending approval of the selected identity-provider transition. No fictional Auth accounts were created and no successful user login, refresh or real file upload/download is claimed yet.

Once dashboard access is authorized, an administrator creates six distinct confirmed test users under `kalling-validation.invalid`: owner_a, owner_b, member, seller, buyer and specialist, each with a unique suffix. Confirm only these fictional users through administrative controls. Do not disable email confirmation, configure SMTP, send email invitations, use a real person's address or change an existing account. Keep initial credentials out of chat and version control.

The runner uses the existing publishable key only. It refuses other projects, privileged keys, real email domains, repeated identities, short credentials, files inside the repository and credentials files readable by other users. HTTP calls have a 20-second limit. It prints check names, never passwords or tokens.

From `demo/`, run the read-only checks with:

```sh
node --experimental-strip-types scripts/hosted-validation.mjs doctor --output /tmp/kalling-hosted-doctor.json
```

For the authenticated run, prepare a private JSON file outside the repository. Its six keys match the role names above; each value has an `email` and `password` for that newly confirmed fictional user. Restrict the file with `chmod 600` on the Mac. Explicitly opt into the test writes:

```sh
node --experimental-strip-types scripts/hosted-validation.mjs run --confirm-fictional --accounts /absolute/private/path/accounts.json --output /tmp/kalling-hosted-acceptance.json
```

The runner verifies password grants, confirmed user lookups, two private firms, known workspace isolation, an accepted analyst invitation, actual immutable original-file upload/download with matching SHA-256, refusal for unrelated parties, role downgrade and revocation using the existing JWT, and Auth refresh. It signs out the fictional sessions afterward. It never configures the brokerage house or sends email. Private fictional fixtures remain for inspection; the report records IDs and object paths for a separately reviewed cleanup. A failed run is reported as failed, not repaired by bypassing policies.

This runner does not validate SMTP delivery, public launch or buyer/seller execution handover over HTTP. The hosted SQL smoke checks the data-room ticket policy separately. The authenticated runner has not been executed; its configuration guards and the read-only doctor have been tested.

## Advisory findings

The health advisor reports no findings. Security notices remain for deliberate default-deny tables and checked SECURITY DEFINER RPCs. Worker endpoints authenticate bounded worker tokens; public lead intake and case-study queries have explicit application gates. These notices have not been dismissed or described as an independent security audit. See the [no-policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [anonymous RPC](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated RPC](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) guidance.

Production review must also consider password protections, foreign-key indexing and RLS query planning. No billing, plan or Auth setting was changed. Detailed live advisory output belongs in the private operational record.
