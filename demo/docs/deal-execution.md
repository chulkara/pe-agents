# Brokerage execution, offer to close

## Scope and starting point

Kalling coordinates the sale of HVAC and refrigeration companies in New Jersey and New York. This prototype records external instructions and confirmations. It does not sign an LOI, decide a legal or lending issue, move money, release escrow or file a license application.

Phase 4 was recovered from local commits b241e8c (verification), f2d2a06 (alerts), be096e4 (offer versions) and 6d194fe (lender preparation and integration). Its fresh starting suite passed 449 tests and the build passed. Remote main was bed0483. These prerequisites are preserved in the publication, rather than reconstructed from an earlier progress message.

## Canonical records

The old `ExecutionPlan` in `lib/execution.ts` belongs to historical buy-side opportunities. Its data is preserved. The brokerage Deal Room uses an execution transaction linked to a listing, company, seller portal, buyer and immutable offer version. It does not copy historical tasks or silently treat an accepted offer as a signed LOI. Reviewed source references, dependency validation, document-change review and accountable next steps carry forward as the shared execution concepts.

Transactions are canonical; the advisor, seller, buyer and scoped specialist screens are projections. The local fictional demo stores transaction and listing changes in the same marketplace record. It provides no cross-user security. Hosted writes use narrow RPCs, current authority checks and row locks. Upload bytes are immutable and stored before metadata can be referenced. Uploading never clears a diligence condition.

## From an offer to a reviewed LOI

1. Share an exact offer version and record the owner's instruction, including how it was confirmed. This opens a Planning transaction, not an executed LOI.
2. Upload the external LOI PDF privately. Record the entities, structure, execution date, named signatories and their stated authority. Cite a page and exact passage for each signature and obligation.
3. A brokerage reviewer checks the current document and external signatures. Only then can the listing move Under LOI or the selected buyer use After LOI data-room access. The old manual grant shortcut no longer confers access.
4. Confirm each obligation against that LOI version. An amendment appends a version and explicitly supersedes a prior obligation; it never silently edits the original deadline.

Date-only deadlines retain the America/New_York date. Timed obligations require an offset. Relative deadlines record the anchor, calendar/business-day convention, whether the anchor counts, explicit holidays, confirmed resulting date and confirming person. Unknown dates need a reason. A planning target does not change a contract deadline.

Stopping negotiations archives the attempt and removes execution access. A replacement buyer starts a new transaction and inherits no prior execution documents, discussions or grants. Reopening marketing also requires a current engagement. Stopping a negotiation never marks the listing Sold.

## Participants, identities and documents

Invitations specify a reviewed recipient, professional role, purpose, coordinator and expiry. The recipient must sign in with the confirmed invited email. Preparing the invitation returns a link; it sends nothing and creates no firm membership. Assignment alone gives no document permission. The advisor can revoke access immediately.

Sellers continue to see stable labels such as Buyer 1, owner-operator. Named documents need independently recorded buyer and seller identity permissions and an appropriately authorized specialist. Lender-private material cannot be shared with the seller. Specialist projections exclude offer terms, unrelated tasks, participants, comparables and general firm history. Reviewer, analyst and viewer permissions remain distinct.

Execution PDFs start private. A reviewer records permission for an exact reviewed version and its recipients. Accepted owner PDFs can be reused by reference. Replacements get immutable versions; prior approvals and dependent reviews become stale. Original versions remain available to authorized brokerage reviewers for audit, rather than appearing in another party's current-file picker.

Opening a file logs the request before serving it. Authenticated storage checks the current participant, current version, grant, identity permission, ticket age and permission revision. Revocation invalidates old tickets even if a later grant restores access. No signed-link or bucket-listing shortcut is provided. Delivered bytes and screenshots cannot be recalled. Known account-number, SSN and credential patterns are refused in coordination text; this is not a general redaction service.

## Shared diligence

The existing Deal Room, owner portal, buyer account and specialist screen show authorized views of the same items. Each item has an accountable person, requestor, reviewer, purpose, next action, due date or explanation, audience, priority, dependencies and sources. Financial, tax, customer, staffing, equipment, premises and license starting requests are templates to review, not automatic legal requirements.

Open, Waiting, Submitted, Changes needed, Resolved and Not applicable have different meanings. A response or upload is not a resolution. A reviewer checks the exact response, evidence and dependencies before resolving it. Not applicable or an externally satisfied condition needs an actual instruction and evidence. Document replacement reopens affected review. Cycles and cross-transaction dependencies are rejected. Private discussions stay within their recorded audience. Today surfaces work awaiting review.

## Closing timeline and readiness

Five separate workstreams must have current reviewed confirmations:

| Workstream | A pending state | The actual completion condition |
| --- | --- | --- |
| Financing | Pre-qualification, underwriting, commitment | Funding confirmed |
| Escrow | Deposit requested | Receipt confirmed by the responsible party |
| License | Proposed representative or transition plan | Professionally confirmed continuity arrangements |
| Premises | Consent requested | Landlord consent received, or sourced professional confirmation that consent is unnecessary |
| Purchase agreement | Draft or executed agreement | Completion confirmed |

These records require a coordinator, next step, date or reason, details and current evidence. A proposed NJ bona fide representative cannot clear the license condition. The screen links official NJ board references and records who checked the actual entity, representative and continuity requirements, and when. NY requirements are reviewed separately. No ownership percentage, grace period, automatic transfer or licensing conclusion is assumed.

Readiness lists blockers, rather than showing a percentage that implies certainty. An analyst can prepare a package. Only a firm owner or administrator can record completion. The command locks the transaction and evidence, rechecks the exact selected buyer, LOI, obligations, required diligence and closing confirmations, then writes the close record, anonymous Sold status, audit and private follow-up drafts atomically. A matching retry returns the original record; changed details with the same command ID are rejected.

Money uses integer US cents. Cash consideration, seller note and other fixed components must reconcile to fixed consideration. Buyer borrowing funds the cash component and is not additional price. Contingent maximum and realized payments stay separate. Every nonzero actual amount needs a cited source passage. The consideration basis and treatment of working capital, inventory and real estate are explicit.

Closed listings stop new NDA requests and matching alerts. Post-close access is limited to the exact agreed handover files and guests, not the old confidential listing or all diligence. Versioned corrections preserve the original close and Sold archive; they invalidate dependent publicity and future comparable eligibility. Later obligations and receipts remain attached to the archive without reopening the sale or creating a portfolio-management product.

## Case-study permission

Closing creates a private draft. The seller can decline, request changes, approve or withdraw permission without affecting service. Permission names the exact version, fields, copy and Website/Email channels. Edits or added channels require another decision. The advisor can publish only the current Website-approved version. Public queries never return private drafts or transaction evidence.

Only text is published here. Buyer and specialist identities are blocked; a named business needs the Business name permission field. Third-party quotes and rights still need manual review. The email action is a reviewed simulation for a fictional `.invalid` recipient. Its status is Simulated, never Sent or Delivered. It is not an SMTP queue or a campaign tool. Withdrawing or replacing permission cancels that version's simulated delivery record and removes stale public copy.

## Private comparables and gradual learning

The advisor can review a comparable only from a completed transaction. It retains the canonical transaction ID, close version, actual date, state, business type, exact consideration basis, reviewed revenue/earnings, period, accounting basis, SDE or EBITDA definition, recast version, sources and review history. Later changes append a revision, not another sale. A fixed consideration of $2.6 million divided by reviewed annual SDE of $500,000 is 5.2 times fixed-consideration/SDE. A $200,000 contingent maximum remains separate.

Analytical authority is a separate professionally confirmed record for internal deidentified analysis. A seller's publicity consent grants neither analytical rights nor private-file access. Fictional, incomplete, unreviewed, disputed, withdrawn, superseded or changed-source records are excluded from real reports. The UI marks internal records; it does not automatically insert them into a buyer memorandum.

Reports group compatible price, earnings and accounting definitions, show sample size, date range, medians, ranges and outlier flags, and prepare a versioned experimental proposal. The original acquisition estimate remains unchanged for later comparison. No coefficients are fitted or released automatically. There is not yet a real closed-transaction dataset sufficient to establish predictive accuracy. A future model release needs independent validation and explicit human approval.

## Optional local-only preparation

Execution uses the existing runner and queue, not a separate agent service. Worker `kalling-worker-3` can prepare a status summary, follow-up questions, LOI questions, case-study outline or comparable explanation from an expressly reviewed minimal packet of cited passages. Restricted lender documents and full original files are excluded. Claims must match exact excerpts; unanswered questions remain proposals. The result cannot send, approve, close, change access or give legal advice.

The same local-only Ollama check, budgets, checkpoints, leases, cancellation and recovery apply. A changed transaction fences stale jobs/results. No hosted model fallback is configured. The M1 pilot can keep `qwen3:4b`; a larger paid service is not required. Core tracking, approvals and closing controls work while the Mac is offline. See [research computer](research-computer.md) for the administrator's update command.

## Migration order and actual hosted status

On November 14, all 22 remaining migrations were applied to `ymbciapnzdmymtthevjp`. The ledger now has 23 entries including the previously applied worker migration. All 57 Kalling tables have RLS enabled and all four buckets are private. The hosted database rollback smoke passed 13 checks; eight unauthenticated HTTPS checks passed. Confirmed fictional users and real authenticated object transport are still pending dashboard access. No firm or brokerage house has been retained. See [hosted validation](hosted-validation.md) and its exact activation ledger.

These sources were applied in this order. Inspect live history before any future activation; do not rerun an already-applied migration:

1. `004_owner_portal.sql` through `011_owner_reviews.sql`, numerically.
2. `20261108215809_kalling_invitation_rls.sql`, then `20261113032739_kalling_dataroom_revocation.sql`.
3. The four Phase 4 migrations: buyer verification, listing alerts, offer versions, lender preparation, in timestamp order.
4. The eight Phase 5 migrations: execution transactions, shared diligence, closing timeline, controlled close, case-study permissions, internal comparables, execution handover/guards, execution draft jobs, in timestamp order.

Use migration operations for DDL, inspect every result and retain the migration ledger. The private tables have RLS and no direct client grants; authenticated callers use narrow checked RPCs. Never put a service-role key in the app, worker or repository. A missing schema produces an unavailable/not-saved state, not a silent local save.

The existing rollback-only fictional Phase 3 database smoke checks have run successfully on the hosted project. Next, verify permissions using separately confirmed fictional accounts and actual Auth/Storage requests. These authenticated transport checks remain unperformed. Keep the brokerage house unset while launch prerequisites remain open. A migration confirmation expiration is never a successful deployment.

## Recovery and validation

Reload a stale transaction before retrying a revision-checked command. After a failed upload, retry with a new immutable file ID; unreferenced bytes confer no permissions. After an interrupted close, reload and replay the same command ID and exact body. Never mark Sold through the old listing selector to repair a failed close. A completed record needs a versioned correction, not reopening.

`npm test` currently passes 485 unit/database/worker tests, including private projections, versioned evidence, source amounts, idempotent close, publicity, comparable eligibility and local-only recovery. `npm run build` passes. Database tests use PostgreSQL through PGlite with simulated Auth/Storage contracts; they do not prove hosted transport. Worker tests use simulated local Ollama and do not prove real model quality.

`e2e/phase5.html` and `e2e/phase5-fixture.ts` are loopback-only development fixtures, omitted from the production build. The fixture uses valid fictional PDFs and the production store interface; it preserves and can restore prior demo records. It exercises twelve stages from missing signed evidence through completion, publicity and comparables, plus a stopped-negotiation branch that refuses the replacement buyer access to the prior documents. `e2e/execution-flow.cjs` repeats the fixture and checks advisor, owner, buyer, public and revoked-specialist screens at 1440, 1024 and 390 pixels. Existing deal and seller flows remain in the deployment checks. The browser review additionally submitted and reviewed real UI forms, including Changes needed, Resolved and a correctly blocked proposed license plan. The working UI displays Saved locally for the demo and does not imply shared hosted security.

The deployment workflow runs unit/database tests, the build and all three browser flows before publishing main. Codex branches run validation without publishing Pages. Check the exact Actions commit and Pages result after publication; source, Pages, database activation and hosted transport are distinct checks.

## Launch holds

Attorney review, brokerage licensing, fee decisions, contact details, SMTP and noindex remain open. There is no payment, escrow-release, license-filing, credit-decision or legal-signature function. No real invitations or messages are sent. Buyers and sellers need only the web app; model assistance remains optional and local-only.
