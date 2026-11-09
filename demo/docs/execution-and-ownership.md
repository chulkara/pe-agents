# Execution and ownership connections

This release connects the existing diligence register and operating workspace through reviewed communications, versioned document sources, accounting imports, and portfolio report snapshots. It reuses the selected local or cloud firm workspace and existing role/save controls. It adds no paid service, email credentials, or accounting API requirement.

## Where to work

- **Execution → Action register** remains the diligence register for document requests, questions, advisors, lenders, dependencies, deadlines, and approvals.
- **Execution → Communications** prepares a request from a saved diligence item. The task, revision, request, owner, and deadline are linked to the draft. A changed task or source requires a new review.
- **Execution → Documents** tracks expected documents, current versions, review dates, and responsible owners. A critical document exception blocks recording the close.
- **Portfolio → Communications / Documents** continues these records after acquisition. Close captures immutable communication and document-monitor snapshots alongside the original investment case and diligence findings. Ongoing records remain separate from that historical snapshot.
- **Portfolio → Accounting imports** reconciles monthly account balances into versioned operating reports and document sources.
- **Portfolio → Portfolio reporting** produces reports across acquired companies for one calendar month and one accounting basis.
- **Work queue → Connected follow-ups** brings message reviews/handoffs, due external-message follow-ups, and document exceptions into the daily queue, with routes to the correct deal or operating company.

## Approved communications

Drafts contain a verified recipient name/address, the verification source, subject, exact message, responsible follow-up owner, next action, deadline, and optional current document references. Document references are review sources; copying text does not attach files.

Human review records the actual signed-in/local operator, decision, disclosure/recipient confirmation, notes, time, and the reviewed content fingerprint. Changing the recipient, text, sources, linked diligence task, or portfolio report creates a new draft revision. Earlier reviews, sent records, and outcomes remain in history. A new revision cannot inherit an earlier delivery or outcome.

Only the latest currently approved draft can be prepared for handoff. The workspace save/version check happens before clipboard access, so a failed cloud save or revision conflict does not copy the message. The audit records an approved handoff preparation; a clipboard error remains visible. This does not send email.

After external delivery, a user can record its actual date and sent-mail reference. That is a user-confirmed coordination record, not provider-verified transport. Follow-ups remain assigned until an explicit response/outcome resolves them. Delivered history remains delivered even when a later document changes; new prospective distribution is blocked where a current review is needed.

**Not connected:** Gmail/Outlook sending, mailbox synchronization, delivery receipts, or automatic reminders outside the app. No messages were sent as part of implementation or QA.

## Document monitoring and diligence coordination

A document requirement has a company/deal/operating scope, label, responsible owner, next-review deadline, next action, optional document family, and critical-for-close flag. Its state is derived from current workspace records:

| State | Meaning |
| --- | --- |
| Missing | No current document in the linked family, or an expected document has not been received. |
| Unreviewed | A current document exists but has no recorded check. |
| Changed | The current document ID, version, or content differs from the reviewed snapshot. |
| Review due | The recorded next-review date has arrived. |
| Current | The recorded check matches the current document and its next-review date is in the future. |

Review retains the source version, opening excerpt, reviewer, findings, date, and next-review date. It is a completeness/content check by the user, not a claim of legal or financial certification. Assigning an exception creates a diligence request before close or a proposed operating priority after close, with the same owner, deadline, and next step. Duplicate unresolved follow-ups are rejected.

These checks run against documents in Kalling when the workspace is evaluated. External drives, data rooms, inboxes, and websites are not continuously polled, and calendar review dates do not establish contractual validity or expiry.

## Accounting CSV contract

Import a CSV of **monthly account balances**, not a transaction ledger or YTD report. Income/expense columns are monthly activity; cash columns are month-end balances. All amounts must be USD and use one explicitly selected Cash or Accrual basis.

Two layouts are supported:

```csv
Period,Account,Amount
2026-09,Service revenue,260000
2026-09,Direct service costs,110000
2026-09,Operating expenses,98000
2026-09,Depreciation,4000
2026-09,Interest expense,6000
2026-09,Cash at month end,110000
```

```csv
Account,September,October
Service revenue,260000,280000
Direct service costs,110000,118000
Operating expenses,98000,106000
Cash at month end,110000,120000
```

These are fictional format examples. In wide files, explicitly map each amount column to `YYYY-MM`. Unmapped columns are skipped. A combined income/expense and cash schedule may need preparation from separate source reports. Native QuickBooks/Xero report formatting, decorative section rows, grouped headers, and transaction-level exports are not automatically normalized.

The parser supports BOM, quoted commas, CRLF, escaped quotes, and quoted multiline cells. Amounts accept US comma grouping and parentheses for negative values. Blanks, dash placeholders, percentages, ambiguous comma grouping, duplicate account/month balances, inconsistent columns, explicit foreign-currency rows, and selected YTD/forecast/budget columns are rejected. Limits are 2 MB, 10,000 CSV rows, 24 mapped monthly columns, and 24,000 monthly balances.

Map every included account to Revenue, COGS, Operating expense, D&A, Interest, Tax, Cash, or Exclude. Define the economic sign explicitly; exported credit balances may need inversion. Subtotal/calculated rows must be excluded with a reason to prevent double counting. Revenue, COGS, Operating expense, and Cash categories must be present for each month; use an explicit zero source account for a genuinely empty category. Prior company mappings can be reused but remain editable and are frozen in each import.

Management EBITDA = mapped Revenue − COGS − Operating expense. It is not normalized/adjusted EBITDA. D&A, interest, and tax must be separated appropriately in the source and mapping. The import does not infer earnings adjustments, book journal entries, perform bank reconciliation, or establish audit assurance.

Before saving, independently enter revenue, EBITDA, and cash control totals with a source/report location for each month. Differences above $0.01 or missing controls block the entire import. Confirm monthly versus cumulative reporting, signs, exclusions, and D&A/interest/tax treatment. Full calendar-month ownership is explicit; an acquisition month with a mid-month close cannot be confirmed as a full ownership month.

An overlapping month creates an operating-report revision only after explicit confirmation. Earlier actuals, budgets, operating metrics, source rows, mapping, controls, preparer, and rationale are retained. The same balances/mapping/basis are not imported twice. Corrected balances or mappings can create reconciled revisions. No failed import partially updates the workspace.

Each import also creates a company document source. Re-importing the same source filename replaces its document family and triggers linked monitoring. The source document deliberately has no inferred annual acquisition observations: monthly revenue must not become annual screening evidence. For sources above 60,000 characters the document contains a labeled opening excerpt; the import retains the complete mapped rows, original amount strings/line references, and source fingerprint. Store the original CSV separately when the full source file is required.

**Not connected:** live accounting sync, arbitrary spreadsheet/workbook ingestion, general-ledger transaction ingestion, FX conversion, or intercompany consolidation.

## Portfolio reporting

Select an exact month and a consistent accounting basis. Fictional companies are excluded by default. Each company row identifies the selected report revision, source, import provenance, management budget, comparable original-case EBITDA guide, and unresolved actions.

Totals include only full, finished calendar-month reports on the selected basis. Missing reports, unknown/different basis, partial acquisition months, unfinished current months, missing company records, and duplicate operating records for one company stay visible and are excluded. Missing values remain unknown instead of zero. Budget and acquisition-case variances use their own matched company populations; a partial budget population is never compared with the entire portfolio's actual total.

These are sums of management reports, not consolidated financial statements. Cash balances are not free cash flow. Ownership-weighted attribution, intercompany eliminations, and realized fund/investor returns are not modeled. Acquisition-case monthly EBITDA is the saved acquisition year's annual figure divided by 12, without seasonality.

Save a reporting snapshot before review/export. Review requires explicit acknowledgement of missing/excluded company reports. Changed actuals, operating scope, or open actions make prospective approval/sharing stale; earlier saved versions remain intact. The text narrative and company CSV preserve snapshot coverage and sources; CSV text fields are escaped against spreadsheet formula injection. A currently approved portfolio snapshot can prepare a communication, which still needs its own recipient/disclosure/message review.

## Verification

The regression suite covers message revision/delivery separation, source/task/report changes, exact approved handoffs, follow-up completion, critical close checks, immutable handoff snapshots, document replacement monitoring, CSV parsing/signs/duplicates/controls, import/report revisions, consistent portfolio populations, reporting exceptions, and stale report distribution. Browser QA uses explicitly fictional local-demo records and exercises accounting → report → approved message, diligence request preparation, document follow-up/review, and Work queue routing. Authenticated cloud-account acceptance testing and external email/accounting-provider integrations are separate from this release.
