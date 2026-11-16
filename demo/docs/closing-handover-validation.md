# Closing-file handover acceptance

**Completed November 16, 2026:** Karan reports all 90 hosted closing-file handover checks passed. A separate read-only query confirms one Closed transaction, one Sample Sold listing, three buyer handover files, two seller handover files, 11 stored execution-file records including one reused owner original, three revoked specialists, the closed portal, restricted buyer, inactive temporary member and zero remaining test sessions. Twenty refused file opens are retained. Public intake remains closed, with no leads, alert drafts or real listings. The full local JSON has not been imported; SQL corroborates retained state rather than rechecking the actual downloaded bytes.

This acceptance step follows the 24 foundation checks, owner uploads and all 65 buyer-access checks. It used the same six confirmed fictional accounts, a separate clearly labelled Sample HVAC listing and small fictional PDFs. No real transaction, signature, professional opinion, funding or fee was represented. No email, model API or paid service was used. See [the recorded acceptance](../production/activation/2026-11-16-handover.json).

The checked controller is `scripts/hosted-handover.mjs`. The full local protocol run also passes **90 checks** against PostgreSQL permissions through PGlite with simulated Auth and HTTP. Source snapshot `4a7af404769fda6f654b48d61773c03b978d982a` passed 528 tests, the build and all three browser flows in [GitHub run 43808430117](https://github.com/chulkara/pe-agents/actions/runs/43808430117). Karan subsequently completed the real hosted run from that snapshot on his Mac.

## What the 90 checks cover

| Area | Required result |
| --- | --- |
| Prerequisites | All six confirmed identities match; both foundation firms match; the completed buyer fixture stays withdrawn/closed; public intake stays closed. |
| Starting execution | The exact listing NDA, advisor approval, versioned offer, owner instruction and signed fictional engagement precede the transaction. |
| Interrupted upload | Retrying before upload reuses the reservation. Arrived bytes resume through the real app store. Repeated completion returns one immutable document version. |
| Original bytes | Successful authenticated downloads match the original SHA-256; another uploader and overwrite attempts are refused. |
| Logged access | A persisted event exists before bytes are read. Metadata and byte requests require a current logged ticket. Private audit records are reviewer-only. |
| Per-file grants | Uploading alone grants nothing. Exact-version review precedes sharing. Removing and restoring a grant cannot resurrect an earlier ticket. |
| Confidentiality | Named documents need both evidenced identity permissions. Restricted lender material cannot go to the seller. Buyer-only and seller-only files stay separate. |
| Replacement | A new stored family version ends access to the previous version. The replacement needs its own review, sharing and logged open. |
| Specialists | Invitations are email-bound and single-use. A revoked participant loses bytes immediately; a new invitation inherits no old grants. A retained specialist receives only its existing selected grants. |
| Firm permissions | A viewer can read after a logged open but cannot upload. Revocation takes effect with the same JWT. An analyst cannot record the final close. |
| Owner originals | An accepted owner upload is reused without copying. Buyer access needs a separate review and permission. Its explicit buyer handover survives closing the seller portal. |
| Controlled close | Financial diligence and all five reviewed conditions precede closing. Changed sharing invalidates an earlier completion package. Retrying the exact command records one Sold event. |
| Handover | Buyer and seller projections contain exactly their own selected file IDs. Pre-close grants cannot bypass those lists. Nonretained specialists lose access. |
| After closing | Advisor-only Closing evidence can be appended without changing the original close. It is not automatically shared and cannot silently expand the recorded handover. |
| Cleanup | Revoke all temporary specialists and the firm member, restrict the fictional buyer, close the portal and sign out all six sessions. Preserve the clearly labelled Sample Sold archive. |

The runner retains the original, still-valid JWTs during revocation checks. A network/server failure is not accepted as an authorization refusal. Requests have a 20-second timeout; credentials, tokens and document bytes are not printed or saved in the report.

## Preparation and Mac run

The following instructions are retained for traceability. **Do not rerun this completed fixture.** Its manifest describes the original prepared state; the sample is now a closed archive. Preserve the passed report in Downloads. A future full run needs a separate bounded fixture, not reopening or overwriting this one.

Use a **complete pinned source snapshot in a new folder** and run `npm ci` there. Do not copy individual files into the old ZIP. The old folder was missing dependencies and transitive imports. Keep every earlier Downloads report.

The operator prepares one new fixture using [prepare-handover.sql](../production/fixtures/prepare-handover.sql), after confirming the preceding buyer run is closed. That script refuses changed broker settings, open intake, unexpected buyer profiles, real listings/leads, outbound drafts and an earlier incomplete handover fixture. It appends a sample company and listing; it does not replace the house, previous listings or previous reports. The manifest is `production/activation/handover-fixture.json` in the checked source.

Paste this setup into Terminal. It leaves the old project and previous reports unchanged. The public archive was checked against all 361 tracked source files, and a clean locked dependency installation and controller import passed:

```sh
kalling_check_dir="$(mktemp -d "$HOME/Downloads/kalling-handover-XXXXXX")" &&
curl -fL https://github.com/chulkara/pe-agents/archive/4a7af404769fda6f654b48d61773c03b978d982a.zip -o "$kalling_check_dir/source.zip" &&
unzip -q "$kalling_check_dir/source.zip" -d "$kalling_check_dir" &&
cd "$kalling_check_dir/pe-agents-4a7af404769fda6f654b48d61773c03b978d982a/demo" &&
npm ci
```

Then, in that same Terminal window, run:

```sh
node --experimental-strip-types scripts/hosted-handover.mjs run --confirm-fictional --prompt --foundation-report "$HOME/Downloads/kalling-hosted-acceptance.json" --buyer-report "$HOME/Downloads/kalling-buyer-access-acceptance.json" --fixture production/activation/handover-fixture.json --output "$HOME/Downloads/kalling-handover-acceptance.json"
```

Enter the same six fictional passwords when prompted. The hidden prompts are owner_a, owner_b, member, seller, buyer and specialist. Do not send credentials in chat or place them in the repository. The command checks both previous reports before making Auth requests, and refuses an already-started handover fixture.

Success ends with `Finished 90 closing-file handover checks`. Save the output report. Report the final line or the specific BLOCKED check; passwords and complete account files are not needed.

## Failure and recovery

The report records only fictional IDs, object paths/fingerprints, check names and cleanup status. It preserves partial history rather than deleting files or forcing a Sold transition. On failure it closes the known test portal, restricts the known fictional buyer, removes the temporary member and specialists, and signs out clients. Any unsuccessful cleanup is explicitly false in the manifest. These cleanup operations use the signed-in fictional firm owner, not a privileged client key.

Do not repeatedly start this controller against a partly used fixture. Its complete workflow is intentionally single-use. Inspect the report and current hosted state first; then finish a focused check or prepare a new bounded fixture. Never overwrite the preceding passed reports. A successful close leaves a Sample Sold listing because a completed transaction cannot be reopened or withdrawn through the old listing selector.

Execution upload retry keys bind the current transaction, uploader, original fingerprint, filename, purpose, confidentiality and requested family. They resume the same reservation rather than create a new document version. Existing callers without a retry key retain the original versioning behavior. The Storage reservation is limited to one day; an expired reservation without arrived bytes needs advisor review rather than silent bypass of its upload lease.

## Permission boundaries and limits

- The new Storage rule permits only authenticated metadata and byte reads. It does not permit signed URLs or object listing. Current file grants and the two-minute logged ticket still apply.
- The reviewer-only `kalling_execution_file_audit` RPC returns at most the latest 1,000 file events for a transaction. Buyers, sellers, specialists, viewers and unrelated firms receive no audit projection. The private event table has no client grants.
- A retained specialist keeps only its existing per-file grants, while its invitation remains active and unexpired. Being named in the handover does not grant every closing document.
- Owner-portal ownership and firm permissions are independent of execution handover. A seller may retain separate access to its own original documents while that portal is active. The strict seller handover-denial checks use execution-bucket files; they do not pretend independent ownership permissions disappeared.
- Execution upload finalization checks stored size and MIME metadata. It is **not** a trusted server-side SHA attestation. The acceptance run downloads actual bytes and compares their SHA-256; the separate buyer-proof validator performs its own trusted attestation.
- This is a controlled document-access test. It cannot withdraw copies already saved to someone's device, establish the legal effect of a signature, validate licensing, perform a professional review or prove protection against screen photographs.

## Validation and remaining work

`production/tests/handoverRunner.test.mjs` first completes the 65-check buyer protocol, prepares the next fixture, then runs the same 90-check controller through SDK/Auth/HTTP stand-ins backed by real SQL roles and PDF bytes. It also interrupts a later run to verify cleanup and retained partial history. Separate tests cover exact retry metadata, Storage operation restrictions, post-close authenticated inserts, client retry progress, audit isolation and report guards.

Repository browser flows check the completed-acquisition screens at 390, 1024 and 1440 pixels; they are local fictional UI evidence, separate from this hosted transport run. The complete hosted mobile sale rehearsal and a real Mac local-only model job remain subsequent steps. Attorney review, NJ/NY licensing, fees, SMTP, real contact details and public launch setup stay open.
