# Kalling brokerage (HVAC, New Jersey and New York)

The public site is now Kalling's sell-side marketplace, modeled on how QuietLight runs a brokerage, but built only for HVAC and refrigeration companies in NJ and NY.

| Path | What it is |
|---|---|
| `#/` | Home: a live valuation dial, how a sale works, current listings, buyer sign-up, and a comparison with a typical broker |
| `#/value` | Full HVAC valuation. Every adjustment to the multiple is explained, along with what would raise the value. Ends with a confidential review request (a lead) |
| `#/sell`, `#/buy` | Guides for sellers and buyers, including NJ master HVACR license continuity |
| `#/listings`, `#/listings/KL-1047` | Anonymous listings with filters. Each listing has a teaser, an NDA to sign online, and an access request. After approval the buyer sees confidential details, can ask questions, and can make an offer (indication of interest or letter of intent) |
| `#/account` | Buyer profile, saved listings, requests and matching listings |
| `#owner` | Owner portal (see `owner-portal.md`) |
| `#advisor` | Advisor workspace, including the **Brokerage** desk: leads, listing builder, NDA approvals, buyer vetting, offers and questions |

## Rules enforced in code and in the database

* **Confidential details** (name, city, website, company link, details) are kept in a separate table. A buyer can read them only after an advisor approves that buyer's NDA request. Restricted buyers lose access immediately.
* **Publishing** is blocked if the public text mentions the business name, its city or its website domain, or if required fields are missing.
* **The NDA** is a per-listing agreement. The buyer signs by typing their exact profile name. The request records the agreement version, the date, and a SHA-256 hash of the exact text.
* **Offers** must add up: cash at close plus seller note plus earnout must equal the price. Accepting a letter of intent moves the listing to "Under LOI". Buyers can withdraw only their own open offers.
* **Owner portal link.** When an advisor approves a buyer, or shares an offer with the seller, the linked owner portal is updated. The buyer appears there anonymously, for example "Buyer 1 · Owner-operator".
* **Lead limits.** A seller inquiry requires consent and a valid email, and is rate-limited to 3 per email per day and 60 per hour overall.

## Valuation method

`lib/hvacValuation.ts` starts from a size band of seller's discretionary earnings multiples. It then adjusts the multiple for:

* service and maintenance share, and the number of agreements
* new-construction exposure
* commercial/residential balance
* owner involvement
* technician depth
* customer concentration
* years in business
* revenue trend
* who holds the master HVACR license

Ranges follow public HVAC valuation guides (OffDeal), and the license factor follows the NJ HVACR Board FAQ. The tool is an estimate, not an appraisal. Advisors should check it against real comparable sales as Kalling closes deals.

## Going live

1. Apply `production/migrations/005_brokerage.sql`. It inserts three sample listings, and you can withdraw them later from the desk.
2. As the owner of the Kalling firm, run once:
   `select public.kalling_brokerage_set_house('<firm id>');`
   Until this is done, the site refuses seller inquiries with a clear message.
3. The public site switches from the one-browser demo to the live database automatically once the brokerage tables exist. Buyers then sign in with email and password.

Before launch:

* Remove `noindex` from `index.html`.
* Add a real contact email or phone number.
* Have an attorney review the NDA text in `lib/brokerage.ts`.
* Confirm whether a business broker license is required for how Kalling will operate.
* Set up email delivery for account confirmations (see `owner-portal.md`).
