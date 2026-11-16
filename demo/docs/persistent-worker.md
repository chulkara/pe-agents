# Persistent Mac pilot and proposal review

This step installs a separate login service for the closed fictional HVAC fixture. It uses the existing Supabase Free project and local `qwen3:4b`. No paid API, model download, new SQL or new test account is needed. Nothing is approved, emailed, published or added to the financial record.

**Accepted November 16, 2026, from Karan's reported Mac run.** All five post-reboot checks passed, the service reported a fresh matching launchd process with local-only Qwen online, and the original-PDF proposal export succeeded. The successful login verifier requires the earlier setup/restart result. The complete 17-line setup output and full local JSON were not supplied, so those are not described as independently imported evidence. A read-only hosted query corroborates one succeeded persistent-worker assignment: one local model call, 9,000 ms and $0 model API charges. See [the acceptance record](../production/activation/2026-11-16-persistent-worker.json).

**Current state: stopped after cleanup.** Karan subsequently ran the scoped cleanup command, which reported removal of this pilot's login item and hosted credential. Supabase confirms the worker is revoked, with zero token rows, connected firm workers, unfinished jobs or test sessions. The transaction remains Closed at revision 57 and intake stays paused. Private checkpoints and the original worker configuration were preserved. The proposal remains pending human review.

The instructions below are retained for a future fresh installation. Preserve the completed report, whose top-level status becomes `stopped` after successful cleanup while its passed restart/login fields remain. Do not rerun setup over that report. When a future rehearsal needs a connected pilot, choose a new output filename; the controller can archive this revoked pilot's private state without deleting it. No reinstallation or reconnection was performed while recording these results.

## Before running

Use the complete checked source ZIP supplied with this change, extracted to a new folder, and run `npm ci` in its `demo` directory. Keep that directory until the login acceptance is complete. Do not copy individual scripts into the older Downloads checkout. Preserve these existing reports:

- `~/Downloads/kalling-hosted-acceptance.json`, the 24-check foundation run.
- `~/Downloads/kalling-handover-acceptance.json`, the 90-check handover run.
- `~/Downloads/kalling-mac-worker-acceptance.json`, the 18-check real local model run.

The controller uses the same fictional `owner_a` password in a hidden prompt. Do not paste a password, pairing code, token or worker configuration into chat. The Mac must be awake, online and signed in. Work waits while the Mac sleeps. A per-user login service does not provide an always-on hosted computer.

Ollama must already confirm cloud features are disabled and `qwen3:4b` is installed. The worker opens the installed Ollama app at startup but does not change its cloud policy. Every model call retains the fail-closed check against the running local server. `OLLAMA_NO_CLOUD` in the worker's environment is an extra setting, not a substitute for that server confirmation.

## Install and test process restart

From the new source's `demo` directory:

```sh
node --experimental-strip-types scripts/persistent-worker.mjs setup --confirm-fictional --prompt --foundation-report "$HOME/Downloads/kalling-hosted-acceptance.json" --handover-report "$HOME/Downloads/kalling-handover-acceptance.json" --worker-report "$HOME/Downloads/kalling-mac-worker-acceptance.json" --output "$HOME/Downloads/kalling-persistent-worker-acceptance.json"
```

Enter the existing fictional `owner_a` password. An output file that already exists is refused. Keep the new report for the later login check; do not rerun setup over it.

This performs 17 setup checks. It verifies the paused brokerage, exact closed transaction, prior succeeded job and empty queue; installs a code-only runtime under `~/Library/Application Support/Kalling/worker-pilot/releases/<hash>`; and registers `com.kalling.worker.pilot` in the current user's LaunchAgents directory. The service uses separate private credentials, state, checkpoints and logs, and does not bind the default worker's local-demo port. It refuses an already installed pilot rather than replacing it.

After pairing, the controller waits for a fresh heartbeat, gracefully stops only that idle pilot process and waits for launchd to replace it. It checks for a new PID and instance while the exact private credential remains unchanged. One reviewed fictional source passage then goes through the usual app queue, local model and returned proposal. The controller checks the new process's observed local calls, zero model API charges, matching digest, unchanged deal and unchanged original worker files. Finally it signs out the owner and leaves the persistent pilot paired and idle.

Expected final message:

```text
Restart passed. The pilot stays running. Reboot and sign in when convenient, then run verify-login.
```

Keep the report and share the final success line or a specific `BLOCKED` message. The report excludes passwords, JWTs, pairing codes, worker tokens and raw model prompts.

## Verify startup after reboot

Save other work, restart the Mac yourself and sign in normally. The controller never restarts the computer. The worker should start and open Ollama without a worker Terminal window. If macOS asks about a background login item, allow the Kalling pilot item. Existing local-only policy must remain enabled.

Reopen Terminal, return to the same checked source's `demo` directory, then run:

```sh
node --experimental-strip-types scripts/persistent-worker.mjs verify-login --confirm-fictional --prompt --foundation-report "$HOME/Downloads/kalling-hosted-acceptance.json" --handover-report "$HOME/Downloads/kalling-handover-acceptance.json" --output "$HOME/Downloads/kalling-persistent-worker-acceptance.json"
```

This adds five login checks to the same report. It refuses a same-boot run before asking for a password. After a new boot, it checks the registered service's PID, instance, start time, same credential, local-only model, fresh hosted heartbeat and unchanged fictional transaction. It makes no model inference request and leaves the pilot online. A successful report has `status: "passed"`, with both restart and login proven by Karan's Mac run. A software test alone never sets those live results.

## Review the earlier proposal

The accepted 18-check report already contains readable `fixtureManifest.proposal.claims` and `questions`. Open it immediately with:

```sh
open -a TextEdit "$HOME/Downloads/kalling-mac-worker-acceptance.json"
```

For a clearer comparison with the original PDF, run the read-only export from the checked source's `demo` directory:

```sh
node --experimental-strip-types scripts/review-worker-proposal.mjs --confirm-fictional --prompt --foundation-report "$HOME/Downloads/kalling-hosted-acceptance.json" --handover-report "$HOME/Downloads/kalling-handover-acceptance.json" --worker-report "$HOME/Downloads/kalling-mac-worker-acceptance.json" --folder "$HOME/Downloads/kalling-proposal-review"
```

The same fictional owner signs in through normal Auth. The command retrieves the exact current input/result, refuses a stale transaction or changed source, logs each original-file read through normal document permissions, and checks its bytes against the input's document hash. It saves `review.txt` and numbered original PDFs in a private new folder. An existing folder is refused, and a partial failed export is removed. The owner session signs out. No new model request is made.

```sh
open -a TextEdit "$HOME/Downloads/kalling-proposal-review/review.txt"
open -a Preview "$HOME/Downloads/kalling-proposal-review/source-1.pdf"
```

Compare each proposed quote and its permitted input passage with the stated PDF page. The model's exact match to the supplied passage does not independently prove that the passage was faithfully extracted from the PDF. Flag inexact wording, unsupported figures or missing context. Then decide whether the proposed earnout question is relevant, already answered or needs more precise wording. Questions remain proposals. This review/export does not record an approval or add a structured diligence question automatically.

The review-branch advisor screen also has **Closing → Optional sourced preparation → Proposal for reviewer judgment**. That screen has not yet been deployed with this branch or validated through a hosted browser interaction. Do not assume a missing proposal on the current Pages version means it was lost; the accepted result remains in Supabase. Browser review and the complete hosted mobile rehearsal remain separate work.

To review the new restart test's result, use the persistent acceptance JSON in `--worker-report` and choose a different new folder. It remains equally unapproved.

## Status, updates and stopping

```sh
node --experimental-strip-types scripts/kalling-worker.mjs status --profile pilot
node --experimental-strip-types scripts/kalling-worker.mjs restart --profile pilot
```

`status` compares launchd's actual PID with a fresh private receipt. An old file alone cannot prove a running service. It never prints the worker token. `restart` refuses active work. A process lock also prevents a second foreground worker from using the same profile. No second Ollama server is started.

The installed runtime no longer depends on Downloads or `node_modules`. The launch item retains an absolute Node executable path; if that Node installation is removed, reinstall from a complete checked checkout after installing Node 22.13 or later. A managed idle upgrade stages and imports the new runtime before replacing the registration and restores the previous login item if bootstrap fails. Unknown legacy registrations are preserved.

Private pilot logs: `~/Library/Logs/Kalling/pilot/worker.log` and `worker-errors.log`. The receipt is `~/Library/Application Support/Kalling/worker-pilot/state/service-status.json`. Do not share the adjacent `worker.json` file. The original default profile stays at `~/.kalling-agent` and is not migrated.

If setup is interrupted, keep the acceptance report. Recoverable failures after installation attempt to revoke and remove only this run's service. An abrupt kill, lost network reply or rollback failure can require explicit cleanup:

```sh
node --experimental-strip-types scripts/persistent-worker.mjs cleanup --confirm-fictional --prompt --foundation-report "$HOME/Downloads/kalling-hosted-acceptance.json" --handover-report "$HOME/Downloads/kalling-handover-acceptance.json" --output "$HOME/Downloads/kalling-persistent-worker-acceptance.json"
```

Cleanup uses the exact saved run, assignment, worker name, creator and runtime identity. It can recover a worker created before a lost pairing reply. It cancels only its unfinished assignment, revokes only its credential and removes only its idle managed launch item. It requires cloud connectivity but no model readiness, unchanged transaction or open intake. It preserves private checkpoints and all earlier passed reports. A later fresh setup can archive only a revoked fictional pilot configuration after checking its firm, creator and worker name; the original state is retained in a private retired-state directory. An old report cannot remove a newer installation in the same profile. It does not remove a different computer or reset the completed handover.

Reference: [Apple's launchd user-agent documentation](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html). LaunchAgents start for the logged-in user; `RunAtLoad` and `KeepAlive` request startup and process replacement. The actual reboot check remains necessary.

Still open: human judgment on the exported proposal, an interrupted active-job launchd rehearsal, browser review, the full hosted mobile sale rehearsal, attorney review, NJ/NY licensing, fees, SMTP, real contact details and public launch setup. The startup/reboot acceptance itself is complete as reported and corroborated; the pilot is currently stopped after cleanup.
