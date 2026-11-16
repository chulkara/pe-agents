# Kalling research computer

Sellers and analysts click **Research company** or **Prepare introduction** in Kalling, watch progress, and review what comes back. A connected computer does the work with Qwen running locally through Ollama. Nobody using the app needs Ollama, Terminal or a file.

For the internal pilot, that computer is Karan's Mac. It works whenever it is awake and online. When it is offline, Kalling says so and the work waits, then starts automatically once the Mac reconnects.

## How it works

The browser submits an approved input snapshot to the Supabase queue. The paired Mac claims it, calls local Ollama, and returns a proposal through that queue. The app polls for progress and the result. The optional default-profile demo uses a separate loopback connection.

* **Cloud firms.** The browser saves the assignment to the workspace, then queues it with `kalling_agent_enqueue`. The worker claims it with a 3-minute lease, reports each step, and renews the lease while it works. The result comes back as verbatim JSON. The open page imports it into the existing review screens. Nothing is accepted or sent automatically.
* **Local demo.** If you aren't signed in, the page talks to the same worker on `127.0.0.1:47311`. Only Kalling origins are accepted, and the `Host` header is checked to block DNS rebinding. Chrome may ask to let the site reach apps on this device; allow it. Safari may block loopback requests from an HTTPS page; use Chrome or a cloud workspace.
* **Recovery.**
  * Every model step is checkpointed under its profile's state directory. The default is `~/.kalling-agent/<scope>/<assignment>/`; the pilot keeps separate state under Application Support.
  * If the worker restarts, it resumes the assignment it already holds without spending an attempt.
  * If it sleeps past its lease, another connected computer can take over. The lease token fences the old one out.
  * Model outages pause claiming instead of burning attempts. Interrupted attempts retry with backoff, four attempts at most. After that, the person sees the error and a **Try again** button.
* **Cancellation.** Cancelling in Kalling stops the worker at its next progress report and blocks the result.
* **Security.**
  * The Mac holds a random 256-bit worker token, stored only as a SHA-256 hash in the database, plus the public project key. No service-role key exists anywhere.
  * A token can claim work only for its own firm. It stops working when an owner or admin disconnects the computer, or when the admin who connected it loses that role.
  * Work requested by a member who lost write access is cancelled, not run.

## One-time setup on the Mac (pilot administrator)

The [18-check real Mac worker acceptance](mac-worker-validation.md) passed as reported by Karan and corroborated by its hosted job/result and cleanup state. One local Qwen call produced a sourced fictional proposal in about nine seconds with $0 model API charges. The temporary worker was stopped and revoked as planned; existing configuration and login items were preserved. The setup below is for the persistent pilot computer, whose startup/login restart still needs its own rehearsal.

Prerequisites are Node 22.13+ and Ollama in local-only mode with `qwen3:4b`. The existing `scripts/local-research.mjs configure-local-only` and `doctor` commands check these.

Use the [persistent worker acceptance](persistent-worker.md) for the current fictional pilot. It installs `--profile pilot` under `~/Library/Application Support/Kalling/worker-pilot`, registers `com.kalling.worker.pilot`, pairs it separately and tests a process restart. It leaves the pilot online. A second command after a real reboot and sign-in verifies startup at login. The original `~/.kalling-agent/worker.json`, default login item and local-demo port are preserved.

The installer copies a standalone runtime outside Downloads. Moving a source ZIP does not break it. The absolute Node executable must remain installed; reinstall the service after changing that path. The pilot opens the installed Ollama app at startup, checks the running server's cloud-disabled status and waits if the model or network is unavailable. It never downloads a model or falls back to a hosted provider.

The pilot consumes the hosted firm queue and does not expose a local HTTP listener. To inspect it from a complete current source checkout:

```sh
node --experimental-strip-types scripts/kalling-worker.mjs status --profile pilot
node --experimental-strip-types scripts/kalling-worker.mjs restart --profile pilot
```

Restart and removal require an idle service. A second process using the same profile is refused. Logs are private at `~/Library/Logs/Kalling/pilot/worker.log` and rotate at 2 MB. `service-status.json` contains a PID, fresh heartbeat, model digest and assignment ID; it excludes credentials and prompt contents. `uninstall --profile pilot` stops the login service but retains its private configuration. Use the acceptance controller's `cleanup` command to revoke its hosted credential as well.

The default profile remains available for a new local-demo installation. An existing legacy login item is refused rather than replaced automatically. Do not uninstall, overwrite or re-pair a legacy worker merely to get past a pilot preflight refusal. The current pilot does not need a browser-to-local pairing connection.

### Updating for drafting and execution (worker 3)

The current worker is `kalling-worker-3`. It supports the existing research, introduction and sale-material drafts, plus optional execution proposals. The database refuses execution work from older workers. Update a managed pilot only while idle, using a complete checked source snapshot and `install --profile pilot`. The installer verifies its existing registration, stages and imports the new runtime before replacement, and restores the prior registration if bootstrap fails. Follow the pilot acceptance instructions before changing its checked model configuration.

`status` lists the model used for each kind. The default is the install model. A larger model can be set per kind in the selected profile's `worker.json`, for example `{"models":{"cim":"qwen3:14b"}}`; allowed models are `qwen3:4b`, `qwen3:8b` and `qwen3:14b`. Pull the model with `ollama pull qwen3:14b` first. See `docs/ai-drafting.md` for what each kind does.

The M1 pilot can retain `qwen3:4b`; the larger model is optional. Execution proposals use reviewed cited passages, not whole original files or restricted lender material. A changed transaction cancels stale work. The model cannot sign, send, change permissions, clear a condition or record completion. Coordination still works while the Mac is offline. See [deal execution](deal-execution.md).

## Database

`production/migrations/003_agent_workers.sql` adds `kalling_agent_jobs`, `kalling_agent_workers` and private token and pairing tables. It has RLS read access for firm members. It also adds bounded RPCs: 10 waiting assignments, 40 per day, 5 computers and 5 open codes per firm, a 120 KB packet limit, and 30-day retention of finished rows. Apply it once, after 001/002. The migration is tested in `production/tests/agentWorkers.test.mjs` with real PostgreSQL (PGlite) under the `anon`/`authenticated` roles. `tests/worker.test.mjs` runs the actual worker against that SQL and a simulated local-only Ollama.

## Limits to keep in mind

* While the browser is closed, results stay in the queue. They are imported the next time someone opens that company's research or outreach step.
* Only one assignment runs at a time per computer. Waiting work is processed oldest first.
* The local demo path stores its queue on the Mac (`~/.kalling-agent/local-jobs`), and the browser stores the workspace. Clearing either loses that demo's state.
* Software tests don't establish real-world model accuracy. Keep using the pilot evaluation in `local-research-pilot.md`.

For the accepted fictional proposal, use the read-only PDF and proposal export in [persistent worker acceptance](persistent-worker.md#review-the-earlier-proposal). The review-branch execution panel can discover it through the same queue, but that browser review path has not yet been rehearsed on the hosted site.
