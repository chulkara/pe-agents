# Kalling

Kalling helps a small acquisition team find, evaluate, acquire, and operate businesses—with agents doing the preparation and people owning the decisions.

The flagship workflow is **real company website research → sourced call brief → reviewed outreach draft**. The research desk is the default daily view. Deal modeling, execution, and portfolio tools remain in a secondary Deals & Operations menu. Investor tracking and manually reported proof counters are removed from the daily navigation; existing stored records are preserved.

## Run the flagship workflow

1. Open your cloud firm through **Accounts & cloud**, or explicitly use the local demo. Cloud firms start empty; fictional sample companies belong only to the local demo.
2. Configure your firm strategy, then add a real company with its public HTTPS website, or import a CSV. Maps discovery is not connected.
3. Open **Research & outreach → Research company website**. The keyless Jina Reader integration captures the homepage and up to two relevant same-business links when available. Only public page URLs are transmitted; firm criteria, owner notes, documents, and private contact information are not sent to the reader.
4. Keep the tab open. Each page is saved through the selected workspace's normal persistence layer. A closed tab stops research; **Continue saved research** resumes remaining pages. Rate limits, blocks, timeouts, and errors stop retrieval. A manual source-excerpt form is available. This is bounded in-browser research, not an unattended background agent.
5. Open the source pages and select statements you checked. Confirm the business identity. Captured statements remain unreviewed until this explicit review; checking an excerpt does not independently verify the underlying claim.
6. Prepare a call brief containing checked statements, source references and exact excerpts, recorded owner context, open promises, questions, and unknowns. Review the brief before preparing outreach.
7. Edit the draft, specify the recipient, and record how that recipient was checked. Save edits as a new version, then approve the exact text and recipient. Copy or download reviewed outreach. **Nothing is sent.**

Briefs and drafts retain immutable prepared snapshots. Changed evidence, refreshed research, owner history, promises, company/contact details, or relevant strategy inputs invalidate prior preparation. Unsaved edits disable approval and reviewed copying. Revising outreach removes approval from the new version. Earlier versions remain inspectable. The most recent three page-capture runs are kept; brief/draft source snapshots and evidence review history are retained.

Retrieval and conservative statement extraction are connected. Call preparation and outreach use structured templates, not an LLM. Named agents do not imply autonomous investment judgment. No paid API credits are used. Third-party free service availability and limits can change.

## Model-backed agents

The [local research pilot](docs/local-research-pilot.md) adds a portable Node runner for local-only Ollama, source-versioned assignments, resumable checkpoints and human-reviewed imports in Company → Research. Start with Qwen3-4B on the M1 MacBook Air with 16 GB. No paid API fallback or cloud model service is configured. The [ten-target CSV](docs/research-pilot-targets.csv) is a starting evaluation set; real-model results and human labels are still pending.

Call preparation and outreach retain the existing reviewed-source workflow. The [agent runtime implementation plan](docs/agent-runtime-plan.md) describes the broader hosted runner and seven playbooks. The existing Supabase scheduler remains a record-reference audit only; it does not execute these local jobs.

## Workspaces and security boundary

- **Local demo:** browser-local records under `kalling-pages-demo-v1`, six explicitly fictional sample companies, no shared team access. Real-company progress excludes samples. Clear site storage to reset local records; export a backup through Activity log first.
- **Cloud firm:** Supabase Auth accounts, firm membership and roles, RLS, compare-and-swap workspace revisions, revision history, audit events, and private file storage. Cloud saves do not silently fall back to local storage. A viewer cannot save edits.
- Cloud connection settings in the frontend are public project settings. Never put service-role keys or secrets in this repository.
- Original document files are uploaded separately through the cloud console; extracted document text and research snapshots are saved as workspace records.
- See [production/README.md](production/README.md) for SQL, storage, scheduler, free-tier limits, and setup. The scheduler's workspace-audit job is separate from browser research; it is not a model-powered research worker.

## Deeper workflows

- **Evidence library:** services, customers, ownership, locations, team, competitors; checked excerpts, assumptions, disputes, revisions, analyst notes, and assigned research questions. Strategic fit, evidence completeness, and owner readiness remain separate.
- **Owner memory:** timing, employee concerns, legacy, desired involvement, promises, conversation history, and next actions.
- **Documents and investment briefs:** PDF/text ingestion, labeled financial observations, trends, concentration, discrepancies, information requests, source snapshots, and human review. OCR is not implemented; earnings adjustments require explicit analyst selection in Underwriting.
- **Underwriting v2:** source reconciliation and signed EBITDA adjustments; annual operating forecasts; multi-tranche acquisition debt, PIK, revolvers, sweeps, rollover, and funding shortfalls; DCF and sensitivity; reverse price ceilings; Base/Downside/Severe comparisons; immutable versions/reviews; and editable Excel export. The selected saved case carries into the operating baseline. See [calculation conventions, references, and limits](docs/underwriting-v2.md).
- **Execution:** diligence requests, responsibilities, deadlines, dependencies, approvals, reviewed communication handoffs, versioned document monitoring, and a human-confirmed close. Critical document checks join close blockers; communication/document history is captured at handoff.
- **Portfolio:** first-100-days plans, sourced actuals, investment-case snapshots, reconciled monthly accounting CSV imports, ongoing communications/document checks, portfolio reporting snapshots, matched-population variance analysis, and review/export. See [execution and ownership connections](docs/execution-and-ownership.md) for workflows, CSV formats, controls, and integration limits.
- **Work queue:** assigned requests and deadlines, plus connected communication handoffs/follow-ups and document exceptions routed to the correct deal or operating company. Research/call/outreach requests route into the single sourced company workflow instead of offering a second approval path. Earlier output snapshots remain readable.

Google Maps discovery, email sending, LLM analysis, and accounting integrations are not connected. No investment decision, binding offer, or transaction is executed by the app.

## Development and deployment

Requires Node 22.13 or newer.

```sh
npm ci
npm test
npm run dev
```

```sh
npm run build
npm run preview
```

GitHub repository: `chulkara/pe-agents`, app source under `demo/`. The root `.github/workflows/pages.yml` tests, builds, and publishes `demo/dist/` to GitHub Pages. Relative asset paths support `/pe-agents/`. No new Pages hosting service is required.

The automated suite covers financial mechanics, evidence revisions, stale preparation, ownership context, research URL boundaries and reader failures, source review, recipient review, immutable drafts, exact approved copies, firm isolation, storage, queues, and closing/operating handoffs. Browser QA also exercises a live public company website in the local demo without transmitting outreach.
