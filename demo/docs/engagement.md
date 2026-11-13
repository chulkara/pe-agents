# Lead to engagement

How a seller inquiry becomes a signed engagement with document requests open in the owner portal. AI plays no part here: every step is an advisor or owner decision.

## Qualify

A new inquiry arrives on **Sellers** as a Lead. **Qualify** opens a short checklist: HVAC or refrigeration work, operating in New Jersey or New York, speaking with the decision maker, why and when the owner wants to sell, and who holds the trade license. Missing items are listed before the advisor can continue.

* **Qualified** moves the company to the Qualified stage and opens the Owner tab of its Deal Room.
* **Not a fit** asks for a reason (for example "Too small to sell through a broker" or "Owner is not ready to sell") plus a note, and moves the lead to Lost. The reason stays in the activity log.

## Engagement letter

`lib/engagement.ts` holds the letter template. It is versioned (`kalling-engagement-2026-11-v1`) and filled from merge fields: firm, owner, business, region, fee terms, term length and the license holder.

* **No default fee.** The success fee, minimum fee and retainer start empty, and the letter cannot be marked ready until they are filled in.
* **Required terms** (exclusivity, term, tail period, confidentiality, how buyers are introduced) are part of the template and cannot be removed in the form.
* **Legal review notice.** Until a firm owner ticks "An attorney has reviewed the engagement letter template" in **Firm settings**, the letter form shows "Template pending legal review" above the letter, so no advisor sends it to a real owner by mistake.

Letter statuses: Draft, Ready to sign, Viewed by owner, Signed by owner, Countersigned, Void.

## Signing

Signing is built in and uses no outside service.

* The owner portal opens in a gated mode. Until the letter is countersigned, the owner sees only the letter and the help contact. Requests are hidden, both in the browser and by row-level security.
* The owner types their full name, which must match the name on the letter, and ticks a consent box. The record keeps the signed-in account email, the time, the template version and a SHA-256 hash of the exact letter text. No IP address or device data is stored.
* The advisor countersigns the same way. The certificate PDF (made with pdf-lib) contains the letter and a final page listing both signatures, the template version and the hash.
* A letter can be voided with a reason at any point before countersigning. A void letter stays in the record.

On countersign:

1. The company moves to Engaged and the lead is marked Engaged.
2. Document requests become visible to the owner.
3. Next steps are added to the portal: upload the first documents, the advisor prepares the recast, the owner reviews the listing and memorandum before anything is shared.

## Prefilled HVAC requests

When the portal is created, the first-round requests are filled in from `hvacRequestTemplates`:

* Profit and loss statements and business tax returns for the last three full years, with the years written out.
* A year-to-date profit and loss.
* Licenses and insurance, with wording for the company's state (New Jersey or New York).
* The maintenance agreement list and a team overview.
* Due dates are 10 business days out (weekends skipped; holidays are not).

Each request says who can see it: advisors now, buyers only if the owner approves sharing it in the data room. The Documents tab has a template picker with the first-round and second-round lists (customer concentration, fleet and equipment, vendor terms, and so on).

## Database

Migration `010_engagement_letters.sql` adds the `requests_hidden` flag on portals, the `kalling_portal_letters` table and the RPCs `kalling_letter_save`, `_ready`, `_viewed`, `_sign`, `_countersign` and `_void`. The hash is computed in the database from the stored text, not taken from the browser. Tests: `production/tests/engagement.test.mjs` and `tests/engagement.test.mjs`.

## Open items

* An attorney must review the template before a real owner signs it.
* The firm has not chosen its fee structure. The form has no defaults on purpose.
* Licensing for business brokerage in New Jersey and New York needs to be confirmed before taking real engagements.
