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
| `#advisor` | Advisor workspace (see below) |

## Advisor workspace

The sidebar follows a sale: **Today, Deals, Sellers, Buyers, Listings, Offers, Research**, then Accounts and cloud, Activity log and Firm settings. Coverage is HVAC and refrigeration in New Jersey and New York.

* **Today** shows four figures (new seller inquiries, NDA requests waiting, open offers, seller documents to review), a "Needs you" list that mixes every source with one action each, and deals by stage.
* **Deals** is the pipeline: Lead, Qualified, Engaged, Preparing, Listed, Under LOI, Closed, Lost. Switch between a board and a table. Drag a card or use its stage menu; each move is written to the activity log. Closed and lost deals reopen only as Qualified.
* **Sellers** lists inquiries from the valuation page and owner contacts. **Qualify** runs a short checklist and moves the lead to Qualified, or records why it is not a fit and moves it to Lost. A qualified company gets an engagement letter with built-in signing; requests open in the owner portal only after both sides sign. See `docs/engagement.md`.
* **Buyers** has NDA requests with the signature details, every buyer with a **funds check** (proof of funds or lender pre-qualification, with a private note buyers never see), and buyer questions.
* **Listings** lists every listing. A company's listing is built in its Deal Room.
* **Offers** compares offers side by side for each listing: price, cash at close, seller note, earnout, financing, close timeline, conditions and status.
* **Research** keeps the sourcing list, work queue and AI research runs on your computer.

### Deal Room

Opening a company opens its Deal Room. The header shows the stage (with a stage menu), the asking price or estimated range, revenue and SDE, the owner portal status, the research computer status, and one primary action for the stage. The left column has next steps shared with the owner portal, key dates and a "what happens next" checklist for the stage.

Tabs: **Overview** (deal summary, sourced facts, risks and open questions, latest activity), **Valuation and recast** (the valuation inputs saved per company, an add-backs table of item, amount, reason and evidence that feeds SDE, every adjustment explained, and the asking price against the estimate), **Listing** (teaser draft and builder with live public preview; publishing waits for the anonymity check), **Materials** (drafts, recast history and the confidential memorandum), **Data room** (documents for approved buyers, owner approval, who opened what), **Buyers**, **Offers**, **Documents** (the owner's requests and files), **Owner** (messages, next steps, invitation link, settings, owner's view), **Research and drafting** and **Activity**. Tabs show counts of items that need action. The tab is in the address (`#advisor/deal/<id>/<tab>`), so reload and the back button return to it.

Stages move on their own at three points: saving a first listing draft moves a deal to Preparing, publishing moves it to Listed, and the seller accepting an offer moves it to Under LOI. The stage is stored on the workspace company as `sellStage`; older records without it get a stage from what exists (a live listing gives Listed, an open portal gives Engaged, and so on).

## Rules enforced in code and in the database

* **Confidential details** (name, city, website, company link, details) are kept in a separate table. A buyer can read them only after an advisor approves that buyer's NDA request. Restricted buyers lose access immediately.
* **Publishing** is blocked if the public text mentions the business name, its city or its website domain, or if required fields are missing.
* **The NDA** is a per-listing agreement. The buyer signs by typing their exact profile name. The request records the agreement version, the date, and a SHA-256 hash of the exact text.
* **Offers** must add up: cash at close plus seller note plus earnout must equal the price. Accepting a letter of intent moves the listing to "Under LOI". Buyers can withdraw only their own open offers.
* **Owner portal link.** When an advisor approves a buyer, or shares an offer with the seller, the linked owner portal is updated. The buyer appears there anonymously, for example "Buyer 1, owner-operator".
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

1. Apply `production/migrations/005_brokerage.sql`, then `006_buyer_checks.sql` (advisor funds checks). It inserts three sample listings, and you can withdraw them later from the desk.
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

## Checking the whole flow

`npm run build`, start `npx vite preview --port 4173`, then `npm run e2e -- <screenshot folder>`. The script runs a sale in the local demo: lead, engagement, recast, a listing blocked by the anonymity check and then published, a buyer NDA, approval in the Deal Room, the anonymous buyer in the owner portal, an offer, sharing it and acceptance moving the deal to Under LOI. It also checks that the back button keeps the Deal Room tab and that key pages fit at 390px.

`npm run e2e:seller -- <screenshot folder>` runs the seller side in 15 steps with a scripted local model: qualify, letter, owner signature and countersignature, uploads, documents read in the browser, recast and teaser drafts with planted mistakes caught, the memorandum blocked until an unsourced sentence is resolved and both approvals are given, publishing, the data room approved by the owner, a buyer viewing with a watermark, the owner's anonymous log, and a restricted buyer refused. It checks for horizontal scrolling at 1024 and 390 pixels. See `docs/ai-drafting.md` and `docs/data-room.md`.
