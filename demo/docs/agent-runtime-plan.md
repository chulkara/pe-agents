# Kalling agent runtime plan

Status: broader hosted-runtime implementation design. The subsequent [local research pilot](local-research-pilot.md) now implements bounded local Ollama execution, checkpoints, source-versioned exports and human-reviewed imports. It requires installation/run on the user's computer; actual model quality and the ten human-reviewed targets remain pending. The hosted model adapter and unattended cloud acquisition worker below are still planned. The Supabase scheduled job remains a database-only record audit.

The product promise remains: agents do the preparation; people own the decisions. An agent is a bounded assignment executed with an existing model, Kalling instructions, permitted tools, firm context, and a defined deliverable. We own the workflow and controls; an initial release does not need a trained foundation model or seven separately purchased agent products.

## One shared runner, seven playbooks

| Playbook | Reuse in Kalling | Model-backed addition | Human decision |
| --- | --- | --- | --- |
| Research | Company records, source capture, evidence review, call briefs | Investigate permitted sources, propose duplicate groups and location/entity distinctions, identify supported ownership statements, summarize unknowns | Accept evidence and any company merge; owner readiness stays unknown without explicit evidence |
| Financial preparation | Document ingestion, annual source selection, conflicts, EBITDA adjustment ledger | Extract candidate figures with exact pages/cells, period/currency/basis, compare statements, propose adjustments | Choose the financial base and accept/reject each earnings adjustment |
| Underwriting | Underwriting v2 engine, scenarios, source snapshots, version differences | Prepare draft inputs, flag unsupported assumptions, call the calculator, explain version changes using computed results | Confirm assumptions, financing, and investment case |
| Relationship | Recorded conversations, owner context, promises, next actions | From user-approved notes, propose memory updates, prepare calls, draft follow-ups | Approve memory changes, promises, recipient and exact outreach |
| Diligence | Action register, document monitors, advisor responsibilities | Compare received information with requests, identify unanswered questions and propose assigned exceptions | Resolve critical diligence and approvals; advisor review remains human |
| IC preparation | Thesis, accepted evidence, saved model, diligence and reviews | Assemble an on-demand decision package with risks, alternatives, and requested decision | Investment committee decision; genuine human dissent is sourced, agent challenges are labeled separately |
| Portfolio analysis | Accounting imports, control totals, actuals, projects and reporting snapshots | Propose mappings, explain measured variances with supporting evidence, identify unexplained movements and prepare updates | Confirm reconciliations, causal explanations and external reporting |

Firm customization comes from strategy, buy boxes, templates, accounting definitions, responsibilities and approval rules. These are versioned configuration supplied to each assignment; customers do not maintain their own forks of the agent code.

## How a user works

From the existing Company, Deal or Portfolio screen, choose **Prepare work**, select a specific assignment, its source scope and deadline, and start it. The task appears in the existing Work queue. Progress shows completed steps, sources, exceptions, budget usage, and a resumable failure state. The result is a dossier, proposed financial reconciliation, draft model, call brief, diligence exception set, IC package, or portfolio report—not an unstructured chat transcript.

The reviewer sees proposed changes alongside source excerpts and existing values. Source checking, financial-base decisions, and communication approval remain distinct decisions in one review queue. Accepting a research dossier does not authorize external email or an investment. A changed document/input makes dependent preparation stale rather than silently overwriting accepted work.

## Execution architecture

Keep GitHub Pages as the frontend. Extend the existing firm-scoped jobs foundation with an authenticated server worker that can call the model provider and validated tools. Provider credentials stay in server secrets. The model never supplies the authoritative firm ID or authorizes access itself. Enforce membership, company scope and allowed actions at every tool boundary, including resumed jobs.

For an initial implementation, bounded worker steps can use a server function; persist checkpoints between steps and respect the host's runtime limits. Larger document processing and long runs may need a separate worker later. The existing `workspace.audit` SQL scheduler must not be relabeled as an AI runtime or used for long network calls inside a database transaction.

Before adding large agent artifacts, move run/checkpoint/proposal storage out of the monolithic workspace JSON. The current pilot has a 2 MB workspace bound and bounded job retention. Use firm-scoped run/result records and private source files with appropriate RLS and retention, while accepted business records remain available through the current workflows. This is planned schema work, not already deployed infrastructure.

## Assignment contract

Each run records:

- Firm, authenticated requester, company/deal/holding, assigned operator and reviewer.
- Playbook, prompt/tool/schema versions and firm-configuration version.
- Exact input source IDs, document versions/hashes, and relevant record revisions.
- Allowed tools, network/source scope, maximum steps/pages/tokens/time and reserved spending allowance.
- Durable status, lease/checkpoint, bounded retries, cancellation and idempotency key.
- Proposed changes, sourced claims, calculations, unknowns, contradictions, assumptions and unresolved actions.
- Validation results, review decisions, actual usage/cost and accepted output version IDs.

Use a small set of named, schema-validated tools: read scoped records/sources; retrieve permitted public pages; find possible duplicates; query accepted financials; calculate scenarios using the existing deterministic engine; compare document versions; stage proposals; and submit a deliverable for review. The model can select a tool; application code validates the arguments and executes it.

Default progress: Queued → Running → Waiting for review → Completed. Failed, Cancelled and Outdated are explicit alternatives. Resuming uses the stored checkpoint and rechecks access, budget and source versions. A declined review creates revisions/rework; it does not erase the earlier output.

## Boundaries and quality

- Start with preparation and proposal permissions. Company merges, accepted financial facts, earnings adjustments, owner memory, critical diligence resolution and external communications require their relevant human decisions.
- Keep valuation, debt schedules, IRR, DCF, ratios and variance arithmetic in tested code. The model selects proposed inputs and explains results; it does not replace the calculator.
- Preserve currency, full reporting periods, Cash/Accrual basis, and reported/assumed status. A source that reports monthly revenue must not become an annual financial fact. Missing data stays unknown.
- Validate that cited excerpts exist in the captured source/version. Citation presence does not prove that a model interpreted the excerpt correctly; analyst review remains necessary.
- Treat websites and uploaded text as evidence, never as instructions granting permissions. Retrieval respects source/network restrictions. Do not infer willingness to sell, succession plans, or ownership from an owner's name or a business's age.
- Never invent human dissent or causal explanations for portfolio variances. Label generated challenges and hypotheses; request supporting management evidence when the cause is unknown.
- Agent outputs are proposals against a source snapshot. Apply accepted changes only after rechecking the current source/record revision to avoid overwriting newer work.

## Cost controls

Keep model calls disabled until a server-side provider credential and a spending policy are deliberately configured. A ChatGPT subscription is distinct from API usage for a deployed product. No model request or paid data purchase is performed by this cleanup/design change.

Start runs on demand, cache unchanged source work, send only the required excerpts, cap tool loops and retries, and reserve allowance before paid calls. Track actual usage per run and firm. Apply application-side limits rather than treating a provider's delayed usage display as an instantaneous stop. Retain the existing no-credit Apollo preference; add paid data/Maps/email services only through an explicit connection and spending decision.

A zero-additional-API-spend pilot can use the existing deterministic workflows and manually reviewed model outputs prepared outside Kalling. That is assisted testing, not unattended customer-facing agents. A self-hosted model is another future option, with its own hosting, maintenance and evaluation requirements.

## Build sequence and completion test

1. Shared assignment runner, scoped tool wrappers, proposal storage, source-version checks, review integration and cost controls.
2. Research agent on imported NJ/NY locksmith targets and permitted public websites. Add broader/Maps discovery only when its source connection is configured.
3. Financial preparation, then underwriting, using reconciled inputs and the existing model engine.
4. Relationship and diligence playbooks on the same runner and proposal/review system.
5. IC package assembly as an on-demand workflow over reviewed outputs.
6. Portfolio analyst using controlled accounting imports and reviewed operating actuals.

Before enabling the research pilot, evaluate ten human-checked target cases including duplicate listings, multi-location businesses, missing ownership evidence, contradictory sources and unavailable pages. Check source support, entity/location separation, unknown handling, review time, cost, retries and cancellation. Financial evaluations add period/basis conflicts and proposed versus accepted adjustments. Passing arithmetic tests does not establish model quality; the agent needs its own evaluation set and a real daily-use pilot.

## Consolidation

Use one assignment queue, one source/provenance system, one versioned proposal/review mechanism, and one canonical calculation engine. Keep agents inside the existing workspaces. Seven playbooks do not need seven chatrooms, dashboards, vendors, always-running loops or separate copies of company data.

Consolidate pre-deal outreach and post-deal communications onto shared review/version semantics while preserving historical records. Keep meaningful human gates distinct. IC preparation should consume reviewed analysis instead of producing a competing source of financial truth. Continue to defer generic investor CRM, fabricated confidence scores and speculative automation that does not advance a real assignment.

This cleanup removes the unused legacy acquisition-model screen/CSS, inline research-dossier form, generic task-board component and their unused presentation helpers. Underwriting v2, the current research/owner workflows, execution, portfolio reporting, historical records and compatibility calculations remain the active paths.

## Official implementation references

- [OpenAI agent definitions](https://developers.openai.com/api/docs/guides/agents/define-agents): model, instructions, tools and typed outputs.
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling): tool requests executed by application code, with schema validation.
- [OpenAI human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals): resumable approval boundaries.
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing) and [ChatGPT usage pricing](https://learn.chatgpt.com/docs/pricing): separate deployment/API and subscription usage.
- [Supabase runtime limits](https://supabase.com/docs/guides/functions/limits): bounded server-function execution and checkpoints.
