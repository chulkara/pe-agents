# One real Mac worker job

This acceptance step uses the completed fictional HVAC handover to run one **Status summary** proposal through the existing app queue, worker version 3 and local `qwen3:4b`. It sends one reviewed fictional completion excerpt to Ollama on `127.0.0.1:11434`. It does not send an email, change a transaction, share a file, publish a case study or accept a model claim.

**Completed November 16, 2026:** Karan supplied the full successful Terminal output for all 18 live Mac worker checks. Supabase separately confirms one succeeded job on its first attempt, worker version 3, local `qwen3:4b`, the required local-only policy, one model call, 8,977 ms of recorded runner time, 263 prompt tokens, 99 output tokens and $0 model API charges. One cited excerpt and one proposed question remain pending human review. The temporary worker is revoked, its token row removed, no jobs remain unfinished and all test sessions are closed. The transaction remains Closed at revision 57, with the original handover intact and intake paused. See [the live acceptance record](../production/activation/2026-11-16-mac-worker.json).

Checked source `f5f4b668e5c961cb94ea02d037ea36caa198a51b` passes 538 tests, the build and all three browser flows in [GitHub run 43820485662](https://github.com/chulkara/pe-agents/actions/runs/43820485662). A clean source export passed locked installation, transitive module loading and a missing-report stop before Auth or inference. The public archive matches all 366 tracked source files. Those source/controller checks use simulated services; Karan subsequently completed the separate real Mac run. The full local JSON has not been imported. Hosted metadata corroborates job/result/cleanup state rather than independently attesting to physical hardware.

Persistent pilot startup/restart and a read-only original-PDF proposal export are now implemented. Run the [separate Mac acceptance](persistent-worker.md). It preserves the original worker, leaves a separate fictional pilot connected after restart, and requires a later real reboot to prove startup at login. The new live Mac results are still pending; none of the earlier accepted reports is overwritten.

## What runs

1. Verify the completed foundation and 90-check handover reports, then confirm the running local Ollama has cloud features disabled and `qwen3:4b` installed. No prompt is sent during this readiness check.
2. Sign in as the existing fictional `owner_a` with one hidden password. Verify the exact Sample Sold transaction, closed portal, restricted buyer, revoked participants, inactive temporary members and paused intake.
3. Refuse another connected computer or unfinished job in that fictional firm. Prepare one current, reviewed Confidential source passage; restricted lender files and complete original documents are excluded.
4. Queue the proposal through `cloudAgentBackend`, the same API the app uses. Pair a temporary worker using a single-use code. Keep its random credential under a separate private Mac directory; never include it in the report.
5. Run the actual worker and Qwen. The worker can process only this pilot job. Another assignment returned by a competing claim is withheld from the model. The normal lease, progress and checkpoint code remains in use.
6. Read the returned result from Supabase, validate every source quote, observe the actual local chat request, record model digest/usage and verify that the transaction and handover have not changed. Leave the proposal **Pending human review**.
7. Stop and revoke the temporary worker, verify its old credential is refused, and sign out the fictional owner. The proposal remains available in the deal workspace; the stopped worker is expected to appear disconnected.

This is an isolated foreground acceptance worker. It does not install a login item, bind a new local HTTP server, overwrite `~/.kalling-agent/worker.json` or disconnect another worker. Persistent launchd operation and the browser click-to-review path are separate checks. Sellers still use the web app; these Terminal steps are for Karan as the pilot administrator.

## Run on the M1 Mac

These instructions are retained for reference. Preserve the passed `kalling-mac-worker-acceptance.json` report. A future run needs a new output filename; do not overwrite the accepted run or reopen the completed handover. The temporary worker intentionally stopped after this check. Persistent startup and login restart still need their own acceptance.

Keep Ollama open, the Mac awake and Terminal open until the command finishes. Use the existing local `qwen3:4b`; no larger model or new model download is needed. Use a complete checked source snapshot in a new folder and install its locked dependencies with `npm ci`. Do not copy an individual script into the older incomplete ZIP.

Keep these earlier reports in Downloads:

- `kalling-hosted-acceptance.json`: the passed 24-check foundation run.
- `kalling-handover-acceptance.json`: the passed 90-check handover run.

Download that complete checked copy into a new folder:

```sh
kalling_check_dir="$(mktemp -d "$HOME/Downloads/kalling-mac-worker-XXXXXX")" &&
curl -fL https://github.com/chulkara/pe-agents/archive/f5f4b668e5c961cb94ea02d037ea36caa198a51b.zip -o "$kalling_check_dir/source.zip" &&
unzip -q "$kalling_check_dir/source.zip" -d "$kalling_check_dir" &&
cd "$kalling_check_dir/pe-agents-f5f4b668e5c961cb94ea02d037ea36caa198a51b/demo" &&
npm ci
```

In the same Terminal window, check readiness:

```sh
node --experimental-strip-types scripts/hosted-worker.mjs doctor
```

It must report local-only `qwen3:4b` ready. If cloud-disabled confirmation is missing, keep the guard enabled. Use the existing `local-research.mjs configure-local-only` command, fully quit/reopen Ollama and repeat the doctor check. No hosted model fallback is available.

Then run:

```sh
node --experimental-strip-types scripts/hosted-worker.mjs run --confirm-fictional --prompt --foundation-report "$HOME/Downloads/kalling-hosted-acceptance.json" --handover-report "$HOME/Downloads/kalling-handover-acceptance.json" --output "$HOME/Downloads/kalling-mac-worker-acceptance.json"
```

Enter **only the existing fictional owner_a password** when prompted. No new accounts or Supabase SQL are needed. The report is reserved atomically with private permissions and an existing report is never overwritten by a new run. It contains fictional IDs, progress, usage, source quotes, proposed questions and cleanup status. It contains no passwords, user JWTs, pairing codes or worker tokens.

Progress updates appear as the queue changes and at least every 20 seconds while polling. The first load may take longer. The overall wait is limited to twelve minutes, each local inference request to three minutes and the execution playbook to at most two model calls. A model-readiness or authorization loss stops this run rather than reconnecting or switching providers.

Success ends with:

```text
Finished 18 Mac worker checks. The local-model proposal is waiting for human review.
```

Review the printed excerpts against the fictional source and read the proposed questions. This proves a connected local-model job and its source contract; it does not establish real-world research accuracy or the quality of an entire diligence review. Keep the JSON report and share the final success line or the specific `BLOCKED` error, not credentials or the worker configuration.

## Interruption and cleanup

Control-C normally cancels an unfinished pilot job, stops the worker, removes its remote credential and signs out. The controller writes cleanup status even when a check fails. It retains checkpoints in the isolated `~/.kalling-agent/mac-validation-*` directory for inspection. The preceding foundation and handover reports, archived transaction and existing worker configuration are preserved.

After an abrupt process kill, power loss or failed network cleanup, use the **same saved Mac worker report** with:

```sh
node --experimental-strip-types scripts/hosted-worker.mjs cleanup --confirm-fictional --prompt --foundation-report "$HOME/Downloads/kalling-hosted-acceptance.json" --handover-report "$HOME/Downloads/kalling-handover-acceptance.json" --output "$HOME/Downloads/kalling-mac-worker-acceptance.json"
```

Cleanup needs the fictional owner's hidden password and cloud connectivity; it does not need Ollama or make a model request. It verifies the exact report, job, firm owner and worker name before cancelling an unfinished pilot job or revoking that worker. It can recover the exact pilot identity if an enqueue or pairing response was lost. Removing that temporary access does not require an unchanged transaction or local-model readiness. It refuses an unrelated worker identifier. It does not delete completed results or turn a failed inference into a pass. A still-open original Terminal process may be stopped with Control-C; cleanup does not kill another local process.

If readiness or sign-in failed before any job/worker IDs were recorded, no remote work was started. Preserve that failed report and choose a new output filename for a later run. Do not remove another computer or modify the completed handover to get past a preflight refusal.

## Evidence and limits

The 18 checks cover local-only readiness, confirmed Auth, exact fixture and empty-queue preconditions, minimal source input, normal enqueue/pair/claim, sourced proposal output, observed local requests with zero model API charges, stable model digest, durable result retrieval, workspace discovery, unchanged transaction, paused intake and credential/session cleanup.

The live report's `transport.actualAuthenticatedTransport` and `actualLocalInference` are true only for the normal hosted client and local transport on macOS. Injected test transports report false. PostgreSQL can corroborate job state, model metadata supplied by the worker, proposal-only output, revocation and audit history. It cannot independently attest to the physical hardware or rederive local model quality. This is not a hardware attestation or independent security audit.

No paid integration or model API is added. The job uses the existing Supabase Free project and local hardware. Do not upgrade the project or add a provider to complete this check. Full hosted mobile sale rehearsal, launchd restart behavior, attorney review, NJ/NY licensing, fees, SMTP, real contact details and public launch setup remain open.
