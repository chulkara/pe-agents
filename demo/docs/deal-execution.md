# Brokerage execution, offer to close

## Reconciliation on November 13, 2026

Current local Phase 4 source was preserved in commits b241e8c (verification), f2d2a06 (alerts), be096e4 (offer versions) and 6d194fe (lender preparation and final UI/integration changes). The fresh starting suite passed 449 tests; the production build passed. Remote main was bed0483. These local commits had not yet been published. Supabase still had foundation tables only and no recorded migrations. Hosted activation and real Auth/Storage transport have not been verified.

## Canonical records

The old `ExecutionPlan` in `lib/execution.ts` belongs to historical buy-side opportunities. Its data is preserved. The brokerage Deal Room uses an execution transaction linked to a listing, company, seller portal, buyer and immutable offer version. It does not copy historical tasks or silently treat an accepted offer as a signed LOI. Reviewed source references, dependency validation, document-change review and accountable next steps carry forward as the shared execution concepts.

Transactions are canonical; the advisor, seller, buyer and scoped specialist screens are projections. The local fictional demo stores transaction and listing changes in the same marketplace record. It provides no cross-user security. Hosted writes use narrow RPCs, current authority checks and row locks. Upload bytes are immutable and stored before metadata can be referenced. Uploading never clears a diligence condition.

## Current activation holds

Attorney review, brokerage licensing, fee decisions, contact details, SMTP and noindex remain open. There is no payment, escrow-release, license-filing, credit-decision or legal-signature function. No real invitations or messages are sent. Buyers and sellers need only the web app; model assistance remains optional and local-only.
