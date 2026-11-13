# Preparing for a lender conversation

Six tasks cover the acquisition plan/experience, financing amount and purpose, buyer contribution, permitted source information, operating projections and lender questions. Task states distinguish not started, in progress, prepared by buyer, reviewed by advisor and not applicable with an explanation. The count is preparation only, never an eligibility score or lending decision. Editing an item requires another advisor review. Existing financing evidence can be referenced by ID; files are not duplicated or attached to an introduction.

Official sources reviewed November 13, 2026:

- https://www.sba.gov/loans/7a-loans/ explains that applications go through lenders and documents depend on circumstances and processing method.
- https://www.sba.gov/loans/lender-match/ explains that a match or loan is not guaranteed.

Kalling is not affiliated with SBA. No loan limits, contribution rules, rates, approval timelines, credit scores or recommendations are hardcoded. Personal application material, SSNs and credit authorization belong in the lender's secure process.

## Introduction permissions

A buyer submits a purpose, non-sensitive summary, optional public listing reference and preferred contact method. This creates an internal request only. No lender is invented. An owner/administrator configures a named contact; an advisor prepares an exact recipient/payload preview. The buyer must consent to that version and the advisor must approve the same version. Editing a contact or summary invalidates consent and approval. The initial payload includes only approved buyer contact/summary fields and a public listing reference. No seller identity, evidence original, CIM, private URL or attachment is selected into it. Identifier checks are an additional guard; the advisor must still review the free-text summary.

The request lifecycle records actor, time, version and next step. Withdrawal or revoked consent fences pending delivery. A simulation leaves it Ready for approval and says no email was sent. Only a server-side completion with a current lease and actual provider acknowledgment can mark Introduction sent. An actual lender response is required to mark Acknowledged. An expired lease is uncertain and requires reconciliation. There is no active live dispatcher or SMTP adapter.

## Activation and tests

Apply `20261113062807_kalling_lender_preparation.sql` after offer versioning. Preparation, configured contacts, requests and preview versions are private, RLS-enabled and default-deny. Buyer IDs are resolved from confirmed identity; per-portal seller access is never used for lender documents. House owners/admins configure contacts, authorized advisors review, viewers cannot make changes. Service delivery RPCs are inaccessible to browser roles.

Fixtures in `tests/lenderPreparation.test.mjs` and `production/tests/lenderPreparation.test.mjs` use fictional .invalid addresses, no real documents and no external messages. Cloud schema unavailability produces an explicit error, with no silent local save. A public connection failure blocks data-intake screens until the user explicitly chooses the labeled fictional demo.
