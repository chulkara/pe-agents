# Hosted activation and acceptance

Earlier acceptance on November 16, 2026: Karan supplied all **18 passed live Mac worker checks**, following the 24 foundation checks, owner uploads, 65 buyer-access checks and 90 handover checks. A read-only query confirms the succeeded proposal, one local-model call, 8,977 ms recorded runner time, $0 model API charges, revoked temporary worker, zero token rows and zero test sessions. The transaction stays Closed at revision 57 with its original handover intact; public intake remains paused. See [Mac worker acceptance](mac-worker-validation.md) and [its recorded evidence](../production/activation/2026-11-16-mac-worker.json). The full local JSON has not been imported; hosted metadata corroborates retained state rather than independently attesting to physical hardware. There are 27 migrations, all 57 Kalling tables retain RLS and all four buckets remain private.

The returned excerpt and question remain pending human review. The initial isolated model run did not install or replace a login item. The later persistent startup/reboot acceptance and its cleanup are recorded below; the full hosted mobile sale rehearsal, browser proposal review, interrupted active-job recovery and launch requirements remain.

The separate [persistent Mac acceptance](persistent-worker.md) has now passed as reported by Karan: all five post-reboot checks, a fresh connected service status and the read-only proposal/PDF export succeeded. Its verifier requires the prior setup/restart result; the full setup console and local JSON were not imported. Hosted state corroborates one further succeeded local Qwen job and subsequent revocation. Karan then ran cleanup, which removed this pilot login item and credential. The pilot is now stopped; the original worker configuration and private checkpoints remain. Proposal approval and the hosted browser/mobile rehearsal are still open.

## Verified on November 14, 2026

Project `ymbciapnzdmymtthevjp` remains on the Free plan. All 22 remaining migrations were applied individually in order. The initial hosted ledger had 23 entries including the previously applied worker migration; subsequent owner-upload and authenticated-metadata guards bring it to 25. Foundation 001 and scheduler 002 were already active and were not rerun. Exact source checksums and recorded versions are in [the activation record](../production/activation/2026-11-14.json).

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

The 24-check run covers the firm workspace and `kalling-private` bucket. Owner-portal uploads were subsequently accepted through linked runs, and buyer proof/validator and data-room transport through the later 65-check run below. Execution diligence files and post-close handover over HTTP remain unverified. SMTP delivery, a connected nonempty model job and public launch also remain outside these acceptance results. Each later result has its own evidence; the initial 24 checks alone do not establish those workflows.

## Owner-portal upload acceptance

The upload-guard migration is applied as hosted version `20261114202229`. All 503 local tests and the build pass. [Source CI run 43637123846](https://github.com/chulkara/pe-agents/actions/runs/43637123846) passed all three local-demo browser flows, including the three screen widths. The updated hosted rollback smoke passed 16 checks, including known-ID upload refusal, seller signed-link refusal and replacement-file reapproval with old-ticket invalidation. Post-smoke queries confirmed two original fictional firms, zero portals or portal files, one original private object, six confirmed fictional accounts, no missing RLS, no anonymous upload/private-gate grants and no brokerage house. The health advisor has no findings; the existing security advisory categories remain open. CI uses simulated local model responses and does not prove hosted browser transport or real model quality.

The next runner is `scripts/hosted-owner-uploads.mjs`. It requires the successful foundation report already saved in Karan's Downloads folder. Before any test writes, it verifies all six confirmed identities, the exact fictional firm names and owners, and that every company in the reused workspace is marked as a sample. It reuses those two firms, adds one fictional company and portal, and records the retained fixtures in a separate report. It never configures a brokerage house, emails a recipient or calls a model.

The first actual run passed 16 checks, then stopped at the signed seller's first download. The stored file and countersigned engagement were present, and the gate was open. Hosted Storage logs showed a refused `object.get_authenticated_info` request (HTTP 400, `NoSuchKey`). A read-only policy diagnostic on that same fictional fixture returned one authorised byte-read row but zero metadata-read rows. The rule had been too narrow. The follow-up migration `20261114222455_kalling_authenticated_file_metadata.sql` permits authenticated metadata and byte reads under the same current file, portal-role and engagement checks; it does not permit signing or listing. The protocol simulation now tests metadata before bytes. A retry was required; the subsequent outcomes are recorded below.

The follow-up is applied as hosted version `20261114223138`. The retained fictional fixture now passes SQL policy checks for both authorised read operations; signing, listing and unrelated-account metadata checks still return no rows. All 503 local tests, the build and all three browser flows passed in [source CI run 43648523881](https://github.com/chulkara/pe-agents/actions/runs/43648523881). The latest hosted rollback smoke passed 17 checks. The original two fictional firms and the partial portal/file are preserved, there are zero test sessions and the brokerage house remains unset. These are policy and simulation results, not a completed HTTP byte comparison.

The acceptance protocol covers the unsigned engagement gate through direct RPC and known-object requests; both fictional signatures; retry before upload and after byte arrival; matching downloaded bytes; deduplication; immutable originals; unrelated-party refusal; signed-link refusal; read-only membership and immediate revocation; changed-attachment review invalidation; and owner-email changes. A successful run closes its test portal and revokes the test viewer. Six hidden password prompts use the existing confirmed fictional accounts. No password file is needed.

From the checked-out review branch's `demo/` folder, after `npm ci`:

```sh
node --experimental-strip-types scripts/hosted-owner-uploads.mjs run --confirm-fictional --prompt --foundation-report "$HOME/Downloads/kalling-hosted-acceptance.json" --output "$HOME/Downloads/kalling-owner-upload-acceptance.json"
```

After the metadata fix, the existing runner can be retried without another download. Preserve the first failed report by writing the retry separately:

```sh
node --experimental-strip-types scripts/hosted-owner-uploads.mjs run --confirm-fictional --prompt --foundation-report "$HOME/Downloads/kalling-hosted-acceptance.json" --output "$HOME/Downloads/kalling-owner-upload-retry.json"
```

An interrupted or failed run may leave private partial fixtures. Its report records known fixture IDs, and a subsequent run first revokes the same fictional viewer before creating another sample company. Retain the reports for reviewed cleanup; do not rerun the foundation runner merely to repeat portal checks. All logins must succeed before any fixture changes. The complete owner-upload protocol is exercised locally against PostgreSQL with simulated Auth/byte transport; that local test is not hosted HTTP evidence.

### Focused owner-revocation recheck

The second Mac run progressed through the first 48 checks and stopped at `Changing the invited owner removes the earlier seller byte access immediately`. Karan supplied that terminal outcome; the full JSON report has not been imported. A read-only hosted check on the retained fictional portal confirmed its invitation had changed, its earlier seller binding was cleared, and that seller's portal, file, authenticated-metadata and byte-read policy queries returned zero rows. This is evidence of server-side revocation, not a completed HTTP acceptance result.

The checker had a separate reproducible defect with the pinned Storage SDK: `StorageApiError.status` contains the HTTP status, while `statusCode` can contain the semantic string `NoSuchKey`. Converting the latter to a number made a refused HTTP 400 response look like a failed refusal test. The corrected classifier reads the actual HTTP status first and refuses to count a network error, server error or response containing data as proof of access revocation. The exact response from Karan's failed check was not preserved, so the diagnostic does not establish that classifier defect as the sole cause of that run's failure.

Private portal downloads now use a fresh cache nonce and `cache: 'no-store'`, while preserving the existing Authorization header. New portal uploads use zero cache lifetime. The frontend still checks the current file-path RPC before any byte request. These changes force a fresh permission check; they cannot remove copies someone already downloaded. No database policy was widened for this follow-up.

Runner source commit `752b9947115b9e47503a4618417a26f266588159` adds `recheck-revocation`. It accepts only the foundation report and the specific failed report with 48 passes followed by this owner-change failure. Before restoring any access, it checks the two confirmed fictional identities, exact firm and portal, fictional engagement signatures, original stored-file identity and expected bytes. It then temporarily restores that one fictional seller, confirms matching original bytes, changes the invitation again, checks a fresh byte refusal with the same unrefreshed JWT, checks RPC and row refusal, and archives the verified fictional portal. Both sessions are signed out. A failed guard leaves the fixture unchanged; a later failure attempts to archive only the verified fixture.

The focused run prompts only for `owner_a` and `seller`. Keep all previous reports. From the existing `demo/` folder, download both runner dependencies:

```sh
curl -fL https://raw.githubusercontent.com/chulkara/pe-agents/752b9947115b9e47503a4618417a26f266588159/demo/lib/privateStorage.ts -o lib/privateStorage.ts
curl -fL https://raw.githubusercontent.com/chulkara/pe-agents/752b9947115b9e47503a4618417a26f266588159/demo/scripts/hosted-owner-uploads.mjs -o scripts/hosted-owner-uploads.mjs
```

Then run:

```sh
node --experimental-strip-types scripts/hosted-owner-uploads.mjs recheck-revocation --confirm-fictional --prompt --foundation-report "$HOME/Downloads/kalling-hosted-acceptance.json" --resume-report "$HOME/Downloads/kalling-owner-upload-retry.json" --output "$HOME/Downloads/kalling-owner-revocation-acceptance.json"
```

Local verification passed 509 tests and the build, including the complete protocol against PostgreSQL policies, the focused same-file recheck, rejection of a mismatched fixture, the real SDK's semantic-code response, unchanged authorization headers and fresh private reads. [Source CI run 43652999090](https://github.com/chulkara/pe-agents/actions/runs/43652999090) also passed all three browser flows, including the three screen widths. Auth and byte transport in those tests are simulated.

On November 15, Karan reported all nine focused Mac checks passed. The focused run verifies matching original bytes before revocation, refusal with the same valid seller JWT afterward, file-path RPC refusal, hidden portal/file rows and fixture closure. Linked with the prior 48 passes, this completes coverage of the original 50-check protocol. These were separate runs. The complete local JSON reports have not been imported; the authenticated HTTP result is user-reported.

A separate read-only hosted confirmation found the exact retained fictional portal closed, its earlier seller binding cleared, its invitation changed to the fictional buyer, three stored portal files, no remaining sessions for the two recheck accounts, and no brokerage house. That corroborates the retained state; SQL metadata was not used to infer downloaded bytes or SHA-256 comparisons. The review branch remains a draft and these frontend changes are not deployed to Pages yet.

### Buyer verification and data-room acceptance scope

Use fictional identities and documents. Public intake stays closed. The controlled private configuration below supersedes the earlier unset-house state: it separates administrative brokerage provisioning from public launch and admits only explicitly invited fictional buyers. It is not a production launch.

The subsequent buyer acceptance covers:

- Buyer proof upload, immutable retry and trusted validator attestation using actual private bytes. A failed validation must prevent submission.
- Proof-document access for the submitting buyer and authorised advisor only. Sellers receive the anonymous verification badge, never the proof document or buyer identity.
- Per-listing NDA and advisor approval before access, followed by logged authenticated metadata and byte reads. Preserve the existing ticket predicates; do not permit listing or reusable signed links.
- The same-session refusal after buyer access, owner document approval or current source-document approval changes. Replaced documents require owner reapproval, and earlier tickets cannot read the replacement.
- Watermarked viewing/downloads and anonymous seller-facing engagement records, checked separately in the browser. HTTP transport alone does not verify the viewer rendering.

## Buyer verification and data-room acceptance

Prepared November 15, 2026. The new source migration `20261115200805_kalling_buyer_access_guards.sql` is applied as hosted version `20261115203609`, bringing the recorded total to 26. It fixes the nullable proof-access predicate, gives authenticated metadata the same logged ticket and current access checks as bytes, requires exact current NDA text at signing and approval, and separates private brokerage configuration from public intake. Ordinary clients cannot provision the global brokerage. Paused registration admits only the administrator's bounded list of invited buyer IDs; existing buyers keep their account access.

The administrative script `production/fixtures/prepare-buyer-access.sql` refused any configured brokerage or existing buyer, lead, access request or real listing. It verified both exact fictional foundation owners and their sample-only workspace, then prepared one new sample company and a clearly labelled sample listing. The current manifest is [buyer-access-fixture.json](../production/activation/buyer-access-fixture.json). Only the existing fictional buyer and specialist identities can register as private-pilot buyers. The house is assigned to the fictional firm only for this controlled pilot. Public intake is false, and post-setup counts confirm zero buyers, leads, non-sample listings and alert drafts. No real contact, email or model call was involved.

The updated `kalling-verification-file` function is active at version 2. Public signing-key discovery returned ES256. The legacy gateway JWT setting is disabled, and the function itself validates the caller through Auth and confirmed email before any reservation, user-authorised download or trusted attestation. Invalid tokens still return HTTP 401, missing tokens return 401, unrelated origins return 403, and the GitHub Pages CORS preflight succeeds. No privileged key was retrieved or added to source or the Mac.

Verification so far:

| Evidence | Result | Scope |
| --- | --- | --- |
| Local unit/database/worker tests | 519 passed | Includes the full 65-check protocol with simulated Auth/HTTP and the actual validator handler against PostgreSQL policies |
| Build | Passed | Current frontend compiles |
| Source browser CI | Passed | Deal, seller and execution flows; phone/tablet/desktop checks, a phone-width open viewer, every stamped download page and viewer closure on access loss |
| Hosted rollback smoke | 17 passed | Database rules only; temporary fixtures rolled back |
| Hosted public HTTP checks | 8 passed | Auth/public isolation, validator denial and CORS |
| Extra validator denials | 2 passed | Invalid JWT and unrelated origin |
| Positive hosted buyer acceptance | 65 passed, reported by Karan | Real hosted logins and transport from the checked snapshot on his Mac; complete local JSON not imported |

Browser CI uses fictional local stores and a scripted local model. It does not prove hosted Auth/Storage transport or real model quality. A held viewer rechecks on focus/visibility and every 15 seconds while visible; server metadata and byte reads enforce revocation on every request. Previously downloaded copies cannot be recalled.

### Completed buyer acceptance and retained setup instructions

Karan confirmed all 65 checks finished on November 15. The actual hosted result is user-reported; the full JSON remains on his Mac. Source snapshot `8a70d235cfd08944a6a3dc8102915d0aed71143e` supplied the complete matching project and locked dependencies.

A separate read-only confirmation at `2026-11-16T04:17:12Z` (November 15 in New York) verified the exact sample listing `KL-910015` is Withdrawn, its data room Unpublished, its one portal Closed and the buyer Restricted. The latest proof is Withdrawn, with one server-attested stored proof and one deliberately mismatched, unattested reservation retained from the validator-negative test. There is one verification event, three stored room originals and five denied-open events. The temporary member is an inactive viewer, all six test Auth sessions are gone, public intake is false, and leads, alert drafts and non-sample listings remain at zero.

This corroborates retained state and cleanup. It does not reconstruct SHA-256 comparisons, HTTP refusals or stamped PDF contents from SQL metadata. Those were checked by the Mac runner. Watermark rendering in a real hosted mobile browser remains part of the later full-sale rehearsal; repository browser CI uses fictional local stores.

The following commands document the completed run. Preserve its report and the archived fixture; do not rerun or reopen it as a fresh buyer test. A new execution-handover stage needs a separately reviewed fictional fixture.

Keep all earlier reports. Use a complete checked snapshot in a new folder. Karan's older ZIP was missing both the `pdf-lib` dependency and `lib/brokerage.ts`; copying individual scripts mixed incompatible source versions. Installing one missing package does not repair the absent project files.

These commands leave the existing project folder unchanged, install the locked dependencies, and use the fixture shipped with the checked snapshot:

```sh
kalling_check_dir="$(mktemp -d "$HOME/Downloads/kalling-buyer-check.XXXXXX")" &&
curl -fL https://github.com/chulkara/pe-agents/archive/8a70d235cfd08944a6a3dc8102915d0aed71143e.zip -o "$kalling_check_dir/source.zip" &&
unzip -q "$kalling_check_dir/source.zip" -d "$kalling_check_dir" &&
cd "$kalling_check_dir/pe-agents-8a70d235cfd08944a6a3dc8102915d0aed71143e/demo" &&
npm ci
```

Then run the acceptance from that new `demo/` folder:

```sh
node --experimental-strip-types scripts/hosted-buyer-access.mjs run --confirm-fictional --prompt --foundation-report "$HOME/Downloads/kalling-hosted-acceptance.json" --fixture production/activation/buyer-access-fixture.json --output "$HOME/Downloads/kalling-buyer-access-acceptance.json"
```

A clean export of the exact checked source completed `npm ci` and reached the foundation-report guard without missing packages or imports. That startup check deliberately used an absent report to stop before credentials, Auth requests or fixture writes. It is setup verification, not a positive hosted acceptance result. Both reported module-loading failures occurred before the runner started, so neither consumed or changed the prepared hosted fixture.

The 65 checks verify all six confirmed identities and the exact prepared private brokerage before any fixture changes. They exercise corrupt-byte rejection, trusted attestation, immutable retry, proof isolation and logged reads, role downgrade, exact-file review, private-note separation, the seller's anonymous badge, exact NDA and advisor approval, after-LOI locking, log-before-bytes, every stamped PDF page, anonymous seller engagement, unchanged-JWT revocation, owner removal, replacement approval and refusal history. A pass withdraws the sample listing and proof, unpublishes its room, closes its portal, revokes the temporary analyst role and signs out all six sessions. Private originals and audit history are retained. The private brokerage remains paused until administrative cleanup or the next reviewed acceptance stage.

On a future failure, preserve the report and supply only the final PASS/BLOCKED lines. The script does not bypass a policy or count a transport/server error as access-denial proof. The buyer transport run above is accepted as reported and corroborated. The PR remains a draft, and these frontend changes have not been deployed to Pages. Execution handover, a real Mac model job, the complete hosted mobile sale and all launch decisions remain open.

Before execution HTTP acceptance, check the same metadata-before-bytes contract in its ticketed Storage policy. Execution remains separately scoped and unverified; the owner and buyer file fixes do not grant execution specialists access.

The replacement-document smoke test separately checks owner reapproval and rejection of the previous buyer ticket inside a rollback-only SQL transaction. It transfers no file bytes, and its temporary house configuration is never visible outside that transaction. The later 65-check Mac run covers actual buyer proof and data-room transport. Closing-file handover, real Mac inference and the complete hosted mobile rehearsal remain subsequent steps.

## Advisory findings

The closing-file handover change preserves the same advisory categories and zero health findings. Its reviewer-only file-audit RPC adds one expected authenticated SECURITY DEFINER entry for review. See [the handover activation record](../production/activation/2026-11-16-handover.json). This is not an independent security audit.

The health advisor reports no findings. Security notices remain for deliberate default-deny tables and checked SECURITY DEFINER RPCs. Worker endpoints authenticate bounded worker tokens; public lead intake and case-study queries have explicit application gates. These notices have not been dismissed or described as an independent security audit. See the [no-policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [anonymous RPC](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated RPC](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) guidance.

Production review must also consider password protections, foreign-key indexing and RLS query planning. No billing, plan or Auth setting was changed. Detailed live advisory output belongs in the private operational record.
