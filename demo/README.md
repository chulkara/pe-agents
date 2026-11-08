# Kalling — GitHub Pages demo

A static, public demonstration of Kalling's acquisition workspace. The private full app is separate and unchanged.

## Explore
1. Configure the example firm and buy box.
2. Add a US company or import a target list from CSV. The initial examples remain NJ/NY locksmiths and access-control businesses.
3. Record source evidence, prepare a call brief, and log an owner conversation.
4. Set follow-ups, draft an introduction, and approve it without sending.
5. Read a text-based PDF or other supported document, inspect financial observations, and create an initial screening brief.
6. Review the evidence and promote the company into the separate opportunity pipeline.

Six fictional companies are labeled as samples. This public build starts from those samples, not records from the private app.

## Data behavior
All edits and extracted document text stay in this browser's local storage. There is no sign-in, shared database, server-side document storage, or background activity. Clearing this site's browser storage resets the workspace. Workspace exports are available in Activity log. Original uploaded files are not retained by a server.

Google Maps and company websites open externally. Record website observations manually. Automated website research, Maps data import, model-generated analysis, and email sending are not connected. Financial screening uses labeled figures and explicit rules; check source excerpts before drawing conclusions. PDF OCR and earnings normalization are not implemented.

## GitHub Pages deployment
The included `.github/workflows/pages.yml` runs tests, builds the static files, and publishes them using GitHub Pages.

1. Create a GitHub repository, `chulkara/pe-agents`.
2. Add this project under `demo/` and the workflow under the repository root `.github/workflows/` on `main`.
3. In **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
4. Run the workflow if it did not start automatically, and use the Pages URL returned by the deployment.

The build uses relative asset paths, including the PDF worker and fonts, so the repository path `/pe-agents/` works without changing the source. The GitHub Pages URL is intentionally not hardcoded before the account/repository is known.

## Local development
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

`dist/` is the deployable static site. No API keys or secrets are required. This project is a prototype demonstration, not a production multi-user service.

## Editorial workspace redesign

Oliva (#C8C040), cotton blue (#B5D0D7), and vanilla (#FEE6A0) with warm light surfaces and dark navigation. The overview opens directly into the working desk, with an optional four-step tour. Company research, a structured owner call brief, editable outreach drafts, contact context, and the next action share a company workspace. Editing an approved draft returns it to review. Cmd/Ctrl+K searches companies. Mobile navigation opens from the menu button.

The prototype remains browser-local. Live Maps discovery, email sending, and model-powered analysis are not connected.

## Acquisition operating workflow · v0.2

- **Work queue:** request research dossiers, call briefs, outreach, investment briefs, or follow-up preparation. Prepare using recorded information; edit, review, approve, and set the company next action. Changed source records block stale approvals.
- **Company research:** six evidence topics, separate strategy fit / coverage / owner readiness, dated owner priorities and promises, and historical context. Owner context follows into call briefs and exports.
- **Investment briefs:** source excerpts, financial periods, discrepancies, information requests, immutable prepared versions, and human review decisions.
- **Underwriting:** sources and uses, senior debt amortization, interest-only seller notes repaid at exit, annual EBITDA growth, tax / capital spending / working capital assumptions, cash flows, equity MOIC, IRR, sensitivity, and saved scenario versions. Simplifications are stated beside the model.
- **Execution:** editable workstreams, owners, due dates, evidence, dependency checks, custom actions, and a human-confirmed close. Closing creates a portfolio record with investment and model snapshots.
- **Portfolio:** first-100-days plans anchored to the recorded close date, manually sourced monthly actuals and budgets, report revisions, variance reporting, and draft management updates.
- **Investor desk:** relationship records, manually recorded commitments and funded amounts, follow-up dates, and exportable update drafts. No fund transfers or communications.
- **Playbook:** Guided and Team modes, independent platform acquisition criteria, and company assignments. Screening and new prepared outputs honor platform criteria. Mode does not create user accounts.

All of these are functional browser-local workflows. They do not constitute live autonomous agents or a production multi-user fund system. Maps discovery, email sending, model-powered analysis, authentication, shared database, and accounting integrations are still unconnected.

The domain tests cover financial mechanics, stale-source reviews, migration, dependencies, closing handoffs, report revisions, and owner context. `npm test` runs all domain test files.

## Deeper company research workspace

Open a company → Research. Three independent assessments show buy-box fit, evidence coverage across six topics, and explicitly reported owner readiness. A company may fit all criteria while having no researched operating topics and no known intent to sell.

- Explore services/revenue mix, ownership, customer profile, locations/territory, team/owner dependence, and named competitors.
- Record observations with source type, reference, supporting excerpt, basis, and optional source date. Assumptions never satisfy source coverage.
- Revise observations while retaining earlier records, check excerpts, and flag disagreements with a reason and review history. Disputed and superseded financials cannot silently become a clean screening or underwriting basis.
- Turn unknowns into assigned, dated questions and queue follow-up preparation. Record sourced answers separately from completing the work item.
- Save analyst interpretation with linked observations. Record dated owner priorities, timing, desired role, and promises; backdated notes do not override newer readiness.
- Search/filter the source register and export the dossier, source history, notes, and questions.

Coverage measures whether a topic has a source claim, not whether the business or claim has been independently verified. This remains manual, browser-local research; Maps discovery and model-powered investigation are not connected.

## Owner relationship memory

Open a company → **Owner memory**, or use the relationship cards under **Relationships**.

- Log a sourced, dated conversation with timing, employee concerns, legacy, desired involvement, and other priorities. Blank topics carry forward earlier recorded context, with a separate source/date per topic. Readiness only changes when explicitly discussed.
- Search conversation history, retain original notes, and revise entries with a preserved earlier record. Operator interpretations remain labeled separately. Older free-text owner context and conversations remain available.
- Track promises with a responsible person, date made, due date, optional linked conversation, fulfillment evidence, and an audit trail. Due today and overdue promises are calculated when the workspace is open. Changing a commitment or date requires a reason. Closing requires a recorded result or release from the owner.
- Queue follow-through preparation in the existing work queue. Completing preparation alone does not fulfill the promise. Recording actual fulfillment closes linked work. Promise changes invalidate earlier prepared call approvals.
- Prepare the next call using sourced priorities, changes over time, open commitments, and context-aware questions. Export the call brief or full relationship history.

Records remain browser-local. There is no call recording, transcription, automatic sending, background reminders, or model-powered inference. Owner readiness and acquisition fit remain independent.

## Source-linked first-pass investment brief

Use **Investment briefs**, or a company’s **Investment brief** tab. Upload a text-based PDF (up to 40 pages), CSV, TXT, MD, JSON, or paste captured source text. Uploading prepares an immutable draft automatically. Use **Upload revision** or select a revision when pasting corrected text; earlier documents are retained and excluded from current inputs.

The brief includes business-quality evidence, financial periods and trends, concentration, discrepancies, unanswered questions, suggested follow-up requests, and owner context. Claim references open the captured excerpt and line/PDF-page location. Full captured text is stored once per document per snapshot. Margin and consecutive-year revenue growth disclose their formulas and input citations; adjusted EBITDA, SDE, forecasts, interim periods, and disputed figures remain separate. Missing information is explicit. Requests can be queued for review without sending anything.

Changed inputs visibly mark older briefs **Out of date** and block new review approval or request queuing from them. Refreshing creates a new version with document and claim comparisons; old figures, source excerpts, and reviews remain available. Uploading a revision prepares this new version directly.

Extraction is deterministic: labeled financial lines, year-column CSVs, simple text financial tables, labeled business observations, and selected quoted passages. General model-powered document understanding, OCR, earnings normalization, and complex table interpretation are not connected. Financial currency/units and accounting basis require review. Documents and brief history remain in browser storage; original binaries are not uploaded to a server.

## Evidence-linked acquisition model

Open **Underwriting**. The input ledger separates reported annual EBITDA from user assumptions for enterprise value, financing, fees, working capital, capital spending, growth, tax, and exit terms. Reported EBITDA is locked until explicitly switched to an assumption. Eligible source quotes can supply values or remain background references; quoted acquisition terms remain underwriting assumptions. Missing EBITDA or purchase price is left blank.

Each saved version records inputs, captured source excerpts and locations, input-specific notes, the version rationale, its parent version, author, calculation engine, and calculated results. Compare two versions to see input/basis changes, old/new source excerpts, reasons, and combined changes in equity funding, MOIC, IRR, annual cash, and exit proceeds. These comparisons show complete-case differences rather than assigning isolated return contributions to individual assumptions.

Document revisions and disagreements flag historical scenarios without changing their inputs. Reported evidence must be refreshed or explicitly replaced by an assumption before saving a new current version. Stale evidence blocks a new review of the older version. Review notes append to the saved record; the close handoff retains the model inputs and evidence audit. Earlier models remain available with their basis classified as unverified assumptions when no source history was captured.

The annual cash-flow mechanics remain simplified and visible beside the model. Sources/uses, amortization, seller-note repayment, additional equity funding, sensitivity, and return calculations are deterministic. This remains browser-local and does not involve live lender quotes, accounting-system connections, or model-powered financial analysis.

### Deal execution workspace

Execution now opens from a reviewed opportunity, including a direct link on its opportunity card. Each room retains its own action register, advisor responsibilities, named approvals, dependencies, and closing readiness. The eight-item starting playbook is editable; existing execution plans and portfolio plans retain their records.

- Document requests, diligence questions, advisor tasks, lender requests, and approvals have an accountable owner, deadline, and explicit next action. Blocked work requires an explanation. Search and filter by type, owner, open/completed, overdue, or attention needed.
- Assign advisors and their scope, then link them to individual items. Bringing unresolved research questions into diligence preserves the company research record and avoids duplicate imports.
- Record answers or advisor confirmation, attach current document snapshots, and preserve before/after updates with reasons. Changed supporting documents flag items and their downstream dependencies for review; historical excerpts remain in the item history.
- Approvals apply to a saved revision and require reasoning. Changes requested become an explicit next action. Subsequent edits require a fresh decision; named reviewers and the person recording their decision are shown separately.
- Completion requires supporting information and completed dependencies. Cycles are rejected. Critical outstanding work, stale document references, and missing approvals block recording the close. Closed and passed execution rooms are read-only. Text exports include responsibilities, requests, sources, decision history, and before/after records.

Coordination remains browser-local. Advisor assignment does not create accounts, invite anyone, send requests, or provide shared data-room access. Recorded approvals do not verify reviewer identity, sign documents, or authorize funds. Deadlines are tracked in the workspace; external notifications are not connected.

### Acquisition-to-operations transition

At close, choose the underwriting version to preserve (or explicitly record that no baseline exists). The portfolio handoff copies that model and its input evidence, the investment rationale, saved brief context, diligence findings, owner priorities, and open commitments. Later changes to company research or underwriting leave this acquisition case unchanged.

Unresolved noncritical execution items, research questions, and owner commitments become proposed operating priorities alongside the initial 100-day playbook. Completed findings remain inspectable and can be turned into proposed projects explicitly. Each project has a responsible owner, deadline, outcome, measure of completion, next step, and links back to its captured findings. Team agreement and completion evidence are explicit. Changes retain the prior plan, rationale, and person recording them.

Portfolio separates Performance, First 100 days, Diligence handoff, and Acquisition case. Monthly reports record actual revenue, EBITDA, cash balance, optional management budgets, capital spending, working-capital investment/release, acquisition-customer retention, and staffing. Reports require a source, rationale, and owned follow-up; revising a month retains earlier values and sources. Missing optional values remain unknown.

Actual-to-case EBITDA comparison uses the frozen model's acquisition-year annual EBITDA divided by 12, clearly labeled as an even monthly guide rather than an original monthly forecast. It includes only confirmed complete calendar months after close that have finished and fit entirely within one modeled acquisition year. No seasonality is assumed, partial months are excluded, cash balance is never equated with cash to equity, and absent revenue or operating forecasts are not invented. Changes to reported acquisition customer/staff baselines are flagged for reconciliation. This does not calculate realized investment returns.

Earlier portfolio records can prepare a structured baseline from their stored close snapshot without reconstructing historical diligence from current research. A separate fictional transition example demonstrates two completed operating months. The workspace remains browser-local; accounting, payroll, CRM, and shared management integrations are not connected.

### Guided acquirer and acquisition team experiences

Overview now provides two daily desks over the same records. The first-time desk focuses on one primary search, an optional budget/equity/LOI plan, weekly activity targets, sequenced next steps, and explanations with examples. Foundation progress excludes fictional samples. New companies inherit the primary strategy; changing experiences retains prior assignments and history.

The established team desk filters assigned work, exceptions, and review queues by platform and responsibility. It connects directly to the relevant work item, document brief, model, execution task, or operating company. Platform pipelines and a portfolio reporting table retain each company's latest reporting month rather than aggregating incomparable periods. Partner preparation applies the firm's standards and keeps missing or stale information explicit.

Playbook provides a four-step setup for strategy, financial criteria, search planning, responsibility defaults, preparation templates, and optional promotion rules. When enabled, a passing recorded screen and a current human-approved source-linked brief are required before opening an opportunity. Changes to review standards invalidate affected evidence preparation; switching daily experiences alone does not.

Teams can export a configuration JSON, preview an import, and apply it with a rationale. Platform criteria merge by name while existing company, work, deal, document, and portfolio records remain. Changes preserve configuration snapshots and rationale. Imports validate their shape, reject stale previews, and do not invite users. Responsibility names and reviewer labels coordinate the browser-local prototype; they are not authenticated accounts, access permissions, shared collaboration, or live integrations.
