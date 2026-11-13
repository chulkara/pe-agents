# Data room

Buyers who signed a listing's NDA and were approved can read documents the owner approved. Every open is logged, and the owner sees who opened what by anonymous label.

## Advisor: Deal Room, Data room tab

1. **Add documents.** Choose from the owner's accepted documents, or **Add memorandum** once both the advisor and the owner approved it (this saves a PDF to the owner portal). Each document gets:
   * a name buyers see (suggested from the file name, for example "Profit and loss statement, 2025");
   * a folder: Overview, Financials, Operations, Customers, Team, Legal and licenses, Other;
   * who can open it: **After NDA**, or **After LOI** (an accepted offer, or an advisor grant with a note);
   * **Allow download**, off by default.
2. **Send to owner for approval.** The owner sees "What buyers will see" in their portal.
3. **Publish data room.** Possible only when the owner approved every document.

Any change to a document's file, folder, tier or download setting sends it back to the owner. Until they approve again, buyers cannot see it. **Remove** or **Unpublish** ends access at once.

The tab also shows **Most engaged buyers** (documents opened, time reading, last opened, and refused attempts), after-LOI grants, and a weekly summary the advisor can send as a portal message. Nothing is sent automatically, even when the owner asked for weekly summaries.

## Owner: portal

* **What buyers will see:** each document with its folder, who can open it and whether it can be downloaded. **Approve**, **Approve all**, or **Don't share** with a reason.
* **Who opened what:** per document, which buyers opened it, how many times and when, shown as "Buyer 1, owner-operator". The owner never sees buyer names or emails.
* **Send me a weekly summary** records the preference for the advisor.

## Buyer: listing page

After NDA approval, the listing page shows the data room by folder. After-LOI documents show a lock.

* **Viewer.** PDFs render with pdf.js; CSV and XLSX show as tables (one sheet per page); images show directly. Every page carries a watermark with the buyer's name, email and the date, plus "Confidential, Kalling data room". On PDFs the watermark is drawn into the page pixels.
* **Keyboard.** Arrow keys and Page Up/Down turn pages, Home and End jump, plus and minus zoom, Escape closes. The page number is announced to screen readers. Focus returns to the Open button on close.
* **Downloads**, when allowed, are PDFs stamped on every page with the same watermark (pdf-lib). Each download is logged.
* **Questions** asked from the viewer are tied to the document and page. The advisor sees "About Confidential memorandum, page 3" in the buyer's thread.
* **Documents you've opened** on the account page lists the buyer's own history.

## How access is enforced (migration 009)

`production/migrations/009_data_room.sql`:

* Tables for rooms, items, after-LOI grants and view events, plus a private ticket table.
* `kalling_dataroom_open` and `kalling_dataroom_download` write the event row first, then issue a ticket. A refused open is logged too: the function returns an error instead of raising, so the log row is kept.
* The storage policy serves a data room file only to the user holding a ticket for that exact file, less than two minutes old. The browser then asks for a signed URL valid for 60 seconds.
* Page events are accepted only with the buyer's own ticket, at most 50 per call and 400 per viewing. Opens are limited to 30 a minute per buyer.
* A buyer's access is checked on every open: listing Live or Under LOI, room Published, NDA approved, buyer not Restricted, and for after-LOI items an accepted offer or a grant.
* No IP address, device fingerprint or browser details are stored.

The local demo store (`lib/dataRoomStore.ts`) mirrors the same rules in one browser: it logs before handing out bytes and checks the ticket age before reading the file.

## Tests

* `tests/dataRoom.test.mjs`: owner approval, re-approval after changes, tiers, logging before tickets, ticket expiry, page event caps, restriction and unpublishing, anonymous owner log, the local store.
* `production/tests/dataRoom.test.mjs`: the same rules in PostgreSQL, including "a file cannot be read without a log row" against the storage policy.
* `e2e/seller-flow.cjs` steps 12 to 15: owner approval and publishing, buyer NDA, watermarked viewing, after-LOI lock, the owner's anonymous log, and a restricted buyer refused and logged. It also checks for horizontal scrolling at 1024 and 390 pixels.

## Limits and open items

* A watermark discourages sharing; it cannot stop someone photographing a screen.
* Scanned documents without a text layer still display in the viewer, but drafts skip them until OCR is added.
