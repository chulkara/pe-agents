# Local research pilot: M1 MacBook Air, 16 GB

Status: local runner and workspace import/review integration. Real-model performance on Karan's Mac and the ten human-reviewed targets remain to be measured. Software tests use a simulated local model; they are not evidence of research accuracy.

## Cost and scope

Use your existing Mac for inference. This pilot makes no paid model API calls, purchases no data, adds no subscription and creates no hosted model service. Electricity, internet, storage and existing equipment are excluded from the $0 model-API figure. Existing hosted workspace/file limits still apply. Website capture uses the existing free public reader or a manually copied permitted excerpt; a rate limit stops capture instead of buying credits. No Maps or Apollo credits are used.

The runner calls only `http://127.0.0.1:11434`, refuses redirects and cloud model names/aliases, requires an already-downloaded local model, and has no paid fallback. It checks the running daemon's `/api/status` before model inspection/inference and requires `cloud.disabled` to be the boolean `true`. Missing, false, malformed, timed-out or unsupported status stops work before a model prompt is sent. It rechecks the cloud flag and model digest before each new inference step, including after resuming. The transport permits only status, local model metadata and chat endpoints; no cloud/web-search tools are exposed. Disable Ollama cloud features as instructed below. Model choice is deliberately restricted to local Qwen3-4B or Qwen3-8B. Both Windows and macOS can run the same Node runner with their appropriate Ollama installation. The web workspace remains browser-based.

This release reads **captured excerpts**, up to six source snapshots. It does not autonomously search the web, discover Maps listings, access accounting systems, send messages or read private documents. Its useful first assignment is to extract sourced proposals, compare statements, flag shared-website records, keep unknowns visible and prepare the evidence for the existing call brief. Large-scale source discovery is a later connector.

## Install on the Mac

1. Check Apple menu → About This Mac. The current [Ollama Mac app](https://docs.ollama.com/macos) requires macOS Sonoma 14 or newer and supports Apple M-series CPU/GPU acceleration. Do not start an OS upgrade without checking compatibility and your own backup requirements.
2. Install [Ollama for Mac](https://ollama.com/download/mac) and [Node.js](https://nodejs.org/en/download). The runner requires Node 22.13 or newer. No npm dependencies or model API key are needed for the runner itself.
3. Download or clone the [pe-agents repository](https://github.com/chulkara/pe-agents). In Terminal, enter its `demo` folder.
4. Configure local-only Ollama. This explicit command preserves existing JSON settings and sets `disable_ollama_cloud: true` in your Ollama settings:

```sh
node --experimental-strip-types scripts/local-research.mjs configure-local-only
```

Quit and reopen Ollama after changing this setting. The runner does not install Ollama or sign into a cloud account for you.

5. Download the starting model, then check the connection:

```sh
ollama pull qwen3:4b
node --experimental-strip-types scripts/local-research.mjs doctor
```

The doctor must print **Verified running Ollama: cloud features disabled.** A settings file alone is insufficient evidence: quit and reopen Ollama after configuring it. If the running server cannot report its cloud-disabled status, update Ollama and stop until verification passes. There is no fallback that skips this check. This is a check of the trusted local server's reported state, not an OS firewall or an independent audit of Ollama. Updates/downloads, public website capture and optional cloud workspace storage are separate network activity.

The current [qwen3:4b distribution](https://ollama.com/library/qwen3:4b) is approximately 2.5 GB on disk and uses Apache 2.0. Runtime memory is greater than download size and depends on context. We start with 4B, one job at a time, an 8K context window and bounded output. Actual speed and quality must be benchmarked on this fanless Mac. 16 GB does not guarantee an acceptable latency or factual quality. Consider `qwen3:8b` only after the baseline, using a new assignment to preserve model provenance.

## Updating an earlier downloaded copy

Changes to GitHub do not update a ZIP already extracted on your Mac. Download/extract the current repository into a new folder, or replace `scripts/local-agent-runner.mjs`, `scripts/local-research.mjs` and `lib/agentProtocol.ts` with their current repository versions. Keep private assignment/checkpoint files outside the public repository. Run doctor again and require the explicit live cloud-disabled confirmation.

Results and checkpoints carry the `local-only-required-v2` policy. The workspace rejects older-policy results, and the worker does not reuse pre-policy checkpoints. Preserve old files for diagnosis and create a fresh assignment if any real work was produced by the earlier worker. The policy field is an untrusted file marker, not a signed security attestation; review/import still relies on your trusted local worker and human source checks.

## First real target

Start with Maffey's Security Group in Elizabeth, NJ, at `https://maffeys.com/`. Create a real company record, set industry to Locksmith and Access Control, and leave owner/contact/financial fields unknown unless separately sourced. Capture its public website, export one local research assignment, run it, then import and classify each claim. Confirm the local-only doctor first. No outreach is sent. After this single case, work through the remaining nine targets and a controlled duplicate case in a separate test workspace.

## Complete one assignment

1. In Kalling, add/import a real company and its correct HTTPS website. Use Company → Research to capture permitted website statements, or manually copy exact excerpts. Finish or pause capture before exporting.
2. Open **Local research**, then **Export research assignment**. The saved request appears in Work queue. Export contains public source excerpts, company identity, firm strategy and at most 100 other company names/websites/locations for duplicate checks. It excludes documents, owner notes, contacts, credentials and full workspace data. Keep these local files private; do not commit them to the public repository.
3. From the repo's `demo` folder, run the downloaded assignment. Replace the path with the real downloaded filename; quote paths containing spaces:

```sh
node --experimental-strip-types scripts/local-research.mjs run "/Users/YOUR_NAME/Downloads/kalling-research-ASSIGNMENT_ID.json"
```

4. The worker selects up to three claims per source using numbered source passages, copies each quotation directly from the source snapshot, then compares the proposed claims. It never asks the model to reproduce a quotation. Invalid passage selections, unexpected claim fields and duplicate proposals are omitted and reported in the result; malformed response envelopes/JSON still stop the step. Same-website matches are possible duplicates/branches, not automatic merges. It writes private checkpoints under `~/.kalling-agent/SCOPE_ID/ASSIGNMENT_ID/`. The browser can close while the local worker continues. Sleeping or turning off the computer interrupts processing.
5. Import the `result.json` path printed by the worker through **Import result** in the company's Local research panel. Import adds proposals only. Wrong assignments, changed source/context versions, cancelled assignments and repeated imports are rejected.
6. Open the sources. Classify every claim **Supported**, **Unsupported** or **Unclear**. Confirm business identity and interpretation, add review notes and the next action. Finishing review adds only Supported claims to the evidence library. No records are merged and no owner intent is inferred. Model-proposed comparisons and duplicate flags still need investigation.
7. Prepare the existing sourced call brief from accepted evidence, review it, then prepare/review the outreach draft. Nothing is sent.

Elapsed review time covers the current review visit. Override the minutes field with your measured effort when you leave/reopen the page or are interrupted. Model runtime and human review time are separate metrics. Export pilot metrics from Local research; the company-record count and exported review records cover the firm. Exclude controlled duplicates when confirming ten distinct real targets.

## Interruption and failure checks

- During the second source or comparison step, press Ctrl+C. Run the **same command** to resume. Completed steps are reused. The interrupted call may run again; token accounting is labeled incomplete if its response was lost. At most two attempts per step and fourteen inference calls per assignment are allowed. No paid fallback occurs.
- Malformed response JSON/envelopes fail validation and retain checkpoints. Source-passage selections have two attempts per versioned step; all calls, including earlier quote-extraction failures, count toward the same fourteen-call assignment cap. When resuming an earlier quote failure, the worker reuses only successful legacy source steps that still pass exact-source validation and retries failed sources with the new passage-selection step. It does not erase old attempts, checkpoints or usage. If the global allowance is exhausted, preserve the failure and export a new assignment.
- Two workers cannot execute the same assignment concurrently. A dead process lock can be recovered automatically; a malformed lock requires inspection.
- Cancelling in the web workspace prevents importing/accepting a result. Stop any separately running local process with Ctrl+C. The UI does not claim to remotely stop a disconnected computer.
- Completed current-policy results reopen without new model calls. This reads a saved result and does not require an active model. Changed model digests, source snapshots, assignment scopes or older safety policies cannot reuse an in-progress checkpoint.
- Source or company changes block a pending import/review. Preserve the old result for diagnosis and export a fresh assignment.

## If an earlier run failed exact-quotation validation

An exact-source error means a candidate quotation or interpretation failed a validation rule; the old error alone does not identify whether the cause was paraphrasing, punctuation, instruction-like text or another mismatch. It does not indicate a cloud-mode failure. The earlier extraction design asked a small model to reproduce a quote exactly. The current worker asks it to select a numbered, literal source passage, and application code attaches the original quote. No fuzzy matching or invented replacement quote is used.

Update `lib/agentProtocol.ts` and `scripts/local-agent-runner.mjs` in the downloaded demo folder from the current repository, keep the local-only Ollama server running, and rerun the same assignment command. New source steps show `:passages-v1` in the progress line. Saved valid legacy sources are rechecked and reused; previous attempts and token usage remain in the journal. Cancel/export a fresh assignment only if its source snapshot changed or the total call allowance is exhausted. Do not delete the checkpoint to bypass a limit.

Each source is divided into at most forty literal contiguous passages, each 15–420 characters. Long lines are split at word boundaries where possible; whitespace, spelling, punctuation and Unicode are copied from the original rather than normalized. Instruction-like spans are omitted. Passage selection establishes citation presence, not semantic support: a model can still attach a real passage to a wrong interpretation. Human claim review remains required.

Import shows any omitted-proposal diagnostics. Inspect gaps rather than treating a partial dossier as complete. The pilot metrics track omitted proposals separately; supported-claim percentages do not include these omissions or measure recall. A zero-claim result can document an information gap, but it is not a successful business assessment.

## Ten-target evaluation

The [ten-target CSV](research-pilot-targets.csv) contains ten real NJ/NY businesses identified from their public company sites on November 9, 2026. These are research candidates, not customers, acquisition prospects with verified financial fit, or owners believed to be selling. No owner/contact data or willingness-to-sell labels are supplied. The **model results and human labels are pending**, not pre-completed benchmark results.

Use the checklist below. Capture the pages yourself, since content can change. Each target needs an independent human check of company identity, source support, omitted material facts and owner-identity claims. Review proposals before accepting them. Blank ownership evidence means Unknown; a historical founder, employee, family name or testimonial author is not automatically a current legal owner.

| Target | Source starting points | Evaluation focus | Human review |
| --- | --- | --- | --- |
| Maffey's Security Group · Elizabeth, NJ | [Home](https://maffeys.com/), [About](https://maffeys.com/who-we-are/) | Separate security/locksmith service mix from unverified current ownership and financial size. | Pending |
| McIntyre's Lawnmower & Locksmith Shop · Westfield, NJ | [Contact](https://www.mcintyreslocklawn.com/contact-us), [About](https://www.mcintyreslocklawn.com/about-us) | Mixed equipment/locksmith business; distinguish activities from revenue contribution. | Pending |
| Advanced County Locksmiths · Union, NJ | [Home](https://www.advancedcountylocksmiths.com/) | Family-business language does not identify legal owners or a succession plan. | Pending |
| Grove Lock, Door & Safe · Plainfield, NJ | [Contact](https://www.grovelock.com/contact-us/) | Service-area towns and different service lines do not establish separate physical branches. | Pending |
| Monaco Lock Company · Jersey City, NJ | [Home](https://www.monacolocknj.com/) | Family-operation and historical tenure are distinct from willingness to sell. | Pending |
| Telestar Locksmiths · New York, NY | [Home](https://www.telestarlock.com/) | Geographic coverage is not a branch count; do not turn dated tenure copy into a current precise age. | Pending |
| Paragon Security & Locksmith · New York, NY | [Home](https://www.paragonsecurityny.com/), [About](https://www.paragonsecurityny.com/about/) | As observed, homepage history uses 1996 while About uses 1988. Surface a possible discrepancy; do not invent its cause or choose a founding year. | Pending |
| Lehman Locksmiths · Brooklyn, NY | [Home](https://lehmanlocksmith.com/), [About](https://lehmanlocksmith.com/about/) | Distinguish Brooklyn location from borough service coverage; contact names do not establish ownership. | Pending |
| Abbey Locksmith · New York, NY | [Contact](https://abbeylock.com/pages/contact), [Services](https://abbeylock.com/pages/services) | Repeated address blocks are not separate shops. Contact-page Saturday hours differed between blocks when inspected; investigate if still relevant. | Pending |
| Richmond Lock & Key · Staten Island, NY | [Contact](https://richmondlockandkey.com/contact/), [Home](https://richmondlockandkey.com/) | Separate specialist service categories from confirmed customer mix, revenue or owner identity. | Pending |

For duplicate handling, in a **separate test workspace** add a second listing of one target with the same website but a different listing name/location. Label it a test duplicate. Confirm the agent proposes investigation and never merges it. Do not add a fabricated branch to your production research universe. These controlled listings are not additional real targets. Same-host detection is intentionally narrow; unrelated domains and name-only duplicates need human investigation in v1.

The starting source filter may omit address lists, hours or history. Record omissions as part of evaluation; capture an exact contextual paragraph manually when permitted. Do not claim the runner reviewed the whole website when it received selected excerpts.

Record for every assignment:

- Source-support accuracy = Supported / (Supported + Unsupported). Report Unclear separately. Exact-quote validation is a separate software check, not a measure of truth.
- Material omissions, incorrectly inferred ownership, missed contradictions and false/missed duplicate candidates. The automatic support percentage does not measure recall or omission quality.
- Your baseline preparation minutes for the same task, total agent-assisted preparation/review minutes and notes on correction effort. The UI records review time; it does not automatically capture the whole baseline workflow.
- Worker elapsed time, model/digest, calls, available token usage and $0 model API charges. Hardware/energy costs are not estimated. Interrupted calls may have incomplete usage.
- Recovery: exact step interrupted, steps reused, whether a completed result was produced, and any extra calls. A resumed flag alone does not prove correct recovery.

Promote the pilot only after all ten targets are reviewed, unsupported material claims are rejected, omissions are understood, and a real interrupted run on the Mac resumes to a reviewable result. Do not present passing simulated tests as this acceptance evidence.

## Boundaries and later hosting

This is an explicit file-transfer pilot, not a remote multi-tenant worker service. Workspace authorization remains with existing local/cloud controls; result files are untrusted proposals, not signed attestations. Never accept a file as proof of model identity or cost independently of the trusted local worker. A future hosted worker needs authenticated job claims, firm isolation at each tool boundary, dedicated result storage and server-controlled usage accounting. Keeping that adapter behind the same assignment contract allows hosted processing later without changing customer workflows.

The existing cloud workspace JSON limit remains in force. This pilot caps assignment history at 30 and keeps source text in existing capture records; it does not upload private local checkpoints or model weights to Supabase. Dedicated agent tables are deferred until the file-transfer pilot proves useful. No cloud migration is part of this release.

Official runtime-status implementation: [server StatusHandler](https://github.com/ollama/ollama/blob/main/server/routes.go) and [CloudStatus response fields](https://github.com/ollama/ollama/blob/main/api/types.go). The endpoint is experimental; an incompatible version fails closed.

Official references: [Ollama macOS requirements](https://docs.ollama.com/macos), [local-only configuration](https://docs.ollama.com/faq), [structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [chat API](https://docs.ollama.com/api/chat), [Qwen3-4B model](https://ollama.com/library/qwen3:4b).
