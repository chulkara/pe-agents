# Kalling research computer

Sellers and analysts click **Research company** or **Prepare introduction** in Kalling, watch progress, and review what comes back. A connected computer does the work with Qwen running locally through Ollama. Nobody using the app needs Ollama, Terminal or a file.

For the internal pilot, that computer is Karan's Mac. It works whenever it is awake and online. When it is offline, Kalling says so and the work waits, then starts automatically once the Mac reconnects.

## How it works

```
Browser ──(signed-in RPC)──▶ Supabase queue ◀──(worker token RPC)── Mac worker ──▶ Ollama 127.0.0.1:11434
   ▲                                                                      │
   └───────── polls progress and result; imports it as proposals ◀────────┘
Local demo (no account): Browser ──▶ http://127.0.0.1:47311 (same worker)
```

* **Cloud firms.** The browser saves the assignment to the workspace, then queues it with `kalling_agent_enqueue`. The worker claims it with a 3-minute lease, reports each step, and renews the lease while it works. The result comes back as verbatim JSON. The open page imports it into the existing review screens. Nothing is accepted or sent automatically.
* **Local demo.** If you aren't signed in, the page talks to the same worker on `127.0.0.1:47311`. Only Kalling origins are accepted, and the `Host` header is checked to block DNS rebinding. Chrome may ask to let the site reach apps on this device; allow it. Safari may block loopback requests from an HTTPS page; use Chrome or a cloud workspace.
* **Recovery.**
  * Every model step is checkpointed under `~/.kalling-agent/<scope>/<assignment>/`.
  * If the worker restarts, it resumes the assignment it already holds without spending an attempt.
  * If it sleeps past its lease, another connected computer can take over. The lease token fences the old one out.
  * Model outages pause claiming instead of burning attempts. Interrupted attempts retry with backoff, four attempts at most. After that, the person sees the error and a **Try again** button.
* **Cancellation.** Cancelling in Kalling stops the worker at its next progress report and blocks the result.
* **Security.**
  * The Mac holds a random 256-bit worker token, stored only as a SHA-256 hash in the database, plus the public project key. No service-role key exists anywhere.
  * A token can claim work only for its own firm. It stops working when an owner or admin disconnects the computer, or when the admin who connected it loses that role.
  * Work requested by a member who lost write access is cancelled, not run.

## One-time setup on the Mac (pilot administrator)

Prerequisites are Node 22.13+ and Ollama in local-only mode with `qwen3:4b`. The existing `scripts/local-research.mjs configure-local-only` and `doctor` commands check these.

From the repository's `demo` folder:

```sh
node --experimental-strip-types scripts/kalling-worker.mjs install      # runs now and at every login (launchd)
node --experimental-strip-types scripts/kalling-worker.mjs status       # model, connection, current work, recent log
```

Next, in Kalling, open any company's **Research** step. Under **Research computers for this firm**, choose **Connect this Mac**. Do this on the Mac itself, as a firm owner or admin. The page creates a 15-minute connection code and hands it to the local worker. If the browser can't reach the worker, the page shows the code instead. Then run `kalling-worker.mjs pair CODE` on that computer.

To use a different model, run `install --model qwen3:8b`. Remove the login item with `uninstall`. Logs go to `~/Library/Logs/Kalling/worker.log`, which rotates at 2 MB.

After pulling repository updates, run `install` again so launchd restarts the new code.

### Updating for drafting (worker 2)

Drafting the recast, teaser, memorandum and comparable sales needs worker version `kalling-worker-2`. The database refuses drafting work from older workers, and Kalling shows an update notice with this command:

```sh
cd ~/pe-agents/demo && git pull && node --experimental-strip-types scripts/kalling-worker.mjs install
```

`status` lists the model used for each kind. The default is the install model. A larger model can be set per kind in `~/.kalling-agent/worker.json`, for example `{"models":{"cim":"qwen3:14b"}}`; allowed models are `qwen3:4b`, `qwen3:8b` and `qwen3:14b`. Pull the model with `ollama pull qwen3:14b` first. See `docs/ai-drafting.md` for what each kind does.

## Database

`production/migrations/003_agent_workers.sql` adds `kalling_agent_jobs`, `kalling_agent_workers` and private token and pairing tables. It has RLS read access for firm members. It also adds bounded RPCs: 10 waiting assignments, 40 per day, 5 computers and 5 open codes per firm, a 120 KB packet limit, and 30-day retention of finished rows. Apply it once, after 001/002. The migration is tested in `production/tests/agentWorkers.test.mjs` with real PostgreSQL (PGlite) under the `anon`/`authenticated` roles. `tests/worker.test.mjs` runs the actual worker against that SQL and a simulated local-only Ollama.

## Limits to keep in mind

* While the browser is closed, results stay in the queue. They are imported the next time someone opens that company's research or outreach step.
* Only one assignment runs at a time per computer. Waiting work is processed oldest first.
* The local demo path stores its queue on the Mac (`~/.kalling-agent/local-jobs`), and the browser stores the workspace. Clearing either loses that demo's state.
* Software tests don't establish real-world model accuracy. Keep using the pilot evaluation in `local-research-pilot.md`.
