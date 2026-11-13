# Offer versions and seller comparison

Offers remain canonical marketplace records. Each submission/revision adds an immutable version of its structured terms. An advisor shares an exact version with a separate owner-facing note. The seller sees only that snapshot, a stable anonymous buyer label and the current evidence badge. Private advisor notes and competing-buyer information are excluded from buyer projections and seller snapshots.

Cash at close + seller-note principal + maximum earnout must equal the headline maximum consideration, exactly. Phase 4 uses whole US dollars and rejects decimals instead of rounding. Fixed consideration is cash plus the note; the earnout is contingent. All arithmetic runs in code and is checked again in SQL. Missing supplemental terms are shown as Not provided. Existing records are marked legacy rather than inventing interest, repayment, security, transition or financing conditions.

A revised offer leaves the previous shared terms visible as history and explicitly marks them outdated. They cannot receive a current owner preference until an advisor shares the new version. Preferences and clarification requests reference the exact version and do not constitute legal acceptance, a signed LOI or a counteroffer. Withdrawals, expiry, restriction, removed NDA access and unavailable listings block current actions. Recording an owner acceptance instruction requires the current shared version and a note explaining how that instruction was confirmed. The existing LOI stage transition is preserved; no signing flow is added.

## Setup and verification

Apply `20261113062023_kalling_offer_versions.sql` after listing alerts. Version/share/action/instruction tables are private, RLS-enabled and have no browser table grants. Purpose-specific RPCs authorize the current buyer, brokerage role or seller portal relationship. Direct buyer reads of the canonical offer table are replaced by a projection excluding private notes.

The owner portal has side-by-side desktop terms and ordered phone cards. Offer selection persists in the same browser. Buyer accounts can revise and withdraw their own offers. Advisors review versions, explicitly share seller notes and record owner instructions. All demonstration data is fictional.

Fixtures: `tests/offerVersions.test.mjs` and `production/tests/offerVersions.test.mjs`. Coverage includes whole-dollar/negative/rounding validation, privacy, immutable sharing, changed versions, version-specific preferences, current badges and removed access. Hosted Auth and object transport are still separate pending checks.
