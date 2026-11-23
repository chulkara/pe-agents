# Before real sellers and buyers

Kalling has been validated end to end with fictional data only: the hosted sale rehearsal of November 2026 took a fictional HVAC sale from inquiry to a recorded close (see [hosted validation](hosted-validation.md)). These are the decisions and setup steps that remain before a real owner or buyer uses it. Most are decisions for the firm, not code.

## Legal and licensing (decisions)

- **Engagement letter.** An attorney reviews the template, then a firm owner ticks "An attorney has reviewed the engagement letter template" in Firm settings. Until then every letter shows "Template pending legal review" ([engagement](engagement.md)).
- **Listing NDA.** An attorney reviews the NDA text in `lib/brokerage.ts` ([brokerage](brokerage.md)).
- **Brokerage licensing.** Confirm whether a business broker license is needed in New Jersey and New York for how Kalling operates, and get it before taking real engagements.
- **Fees.** Decide the success fee, minimum, retainer, exclusivity, tail and termination terms that go into real letters. The rehearsal used placeholder numbers.
- **Privacy and terms.** Publish a privacy notice and terms of use covering seller documents, buyer financing evidence, logged data-room reads and local AI processing.
- **Professional coverage.** Decide on errors and omissions insurance for advisory work.

## Accounts and email (setup)

- **Email delivery.** Supabase's default email service only reaches project team addresses, so outside owners and buyers cannot confirm new accounts. Set up an email provider for account confirmations before inviting anyone ([owner portal](owner-portal.md)). Kalling itself sends no other email; advisors send portal links themselves.
- **Contact details.** Add a real contact email or phone number to the public site.
- **Search visibility.** Remove `noindex` from `index.html` when the public site should appear in search.

## Pending migration

- Apply `production/migrations/20261123170000_kalling_professional_access.sql` before sellers or buyers use [CPA and attorney access](professional-access.md). Until then that panel shows a missing-function error in the hosted product.
- Apply `production/migrations/20261123190000_kalling_seller_helpers.sql` (after the one above) for [seller staff helpers](seller-helpers.md) and the advisor's view of each side's CPA and attorney.

## Data and switches (setup, in this order)

1. **Separate test data.** Every listing is currently labeled a sample and every lead uses `@kalling-validation.invalid`. Decide whether real work starts in a fresh project or this one after removing the fictional firm, listings and accounts.
2. **Database backups.** Confirm the backup and restore plan for the Supabase plan in use before storing real documents.
3. **Open intake last.** `kalling_private.brokerage_settings.intake_open` stays false until everything above is done. Opening it lets the public valuation and contact forms create real leads.

## Product items already fixed after the rehearsal

Lost sources on revised closing conditions, unclear save confirmations and double saves, the closing checklist only appearing on failure, losing your place on reload, the AI input snapshot not surviving a reload, and the setup script leaving the buyer Restricted. See the commits on the validation branch.

## Still to confirm on real hardware

- The [interrupted job check](mac-worker-validation.md#interrupted-job-check-on-your-mac) on the Mac.
- A second complete rehearsal on the fixed build, ideally in one sitting without resuming.

## What Kalling does not do

There is no payment, escrow release, license filing, credit decision or legal signature service. Advisors record external confirmations; people make every decision. Model assistance is optional and runs only on the firm's own computer.
