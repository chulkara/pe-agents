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
