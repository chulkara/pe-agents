# Brief: Ask the data room

Owner: Codex · Branch: `codex/ask-data-room-<yyyymmdd>` · Reviewer: Claude · Approver: Karan
Read `AGENTS.md` first. Claim row 4 in `BUILD_BOARD.md` in your first commit.

## The outcome
A buyer (or the advisor) types a question about a listing's data room, such as "How many
maintenance agreements renew in the spring?", and gets back the passages that answer it, each
quoted word for word with the document name and page number, ranked by relevance. When nothing
answers it, they can send the question to the advisor in one tap.

This turns diligence from "open twelve PDFs" into "ask and get the page". It must never invent an
answer, and it must never show a buyer a page they are not allowed to see.

## What exists already (read these)
- `demo/lib/extract.ts`: per-page text for uploaded files (`Extract.pages[{page,text}]`).
- `demo/lib/dataRoom.ts`: room items, tiers (`After NDA`, `After LOI`), `buyerTier`, `buyerItems`
  (what a buyer may see), `askAbout` (question about a page, goes to the advisor), view events.
- `demo/lib/dataRoomStore.ts`: local and cloud stores; how buyers open items with short tickets.
- `demo/src/site/DataRoom.tsx` (buyer), `demo/src/advisor/dataRoom.tsx` (advisor).
- `demo/lib/brokerage.ts`: `askQuestion` for listing-level questions to the advisor.

## Build
1. `demo/lib/askRoom.ts`, pure and tested:
   - `searchRoom(question, docs[{itemId, displayName, pages[{page,text}]}], limit=5)` returns
     `[{itemId, displayName, page, quote, score}]`. Plain keyword and phrase scoring (with simple
     stemming and HVAC synonyms, for example "agreements" ~ "maintenance plans" ~ "service
     contracts") is enough for the first cut. No model needed to rank.
   - `quote` is an exact substring of the page text (one to three sentences around the best hit),
     never paraphrased. Add a test that every quote is a substring of its page.
2. Permission first: the caller passes only documents the viewer may see. For a buyer that is
   exactly `buyerItems(...)` for their tier; an `After LOI` item never reaches the search for a
   buyer at `After NDA`. Write a test with a buyer at each tier.
3. Buyer screen (in the listing's data room, `src/site/DataRoom.tsx`): one question box, results as
   cards showing the quote, document and page, with "Open at page N" (use the existing open flow so
   the view is logged and watermarked). Empty state: "Nothing in the documents answers that yet."
   with "Ask the advisor" which uses the existing question path. Works at 390px.
4. Advisor screen (`src/advisor/dataRoom.tsx`): the same box searching every item in the room, to
   check what buyers will find before publishing.
5. Log each buyer search as a view event or a new event type so the owner's weekly summary can say
   "3 questions asked". Store the question text only for the advisor, not the owner.
6. Optional, behind a clear "Draft a short answer" button and only when the local model runner is
   reachable: a two-sentence summary from the quoted passages only, shown above them and labelled
   "Drafted from the passages below". If the model is not reachable, the button is hidden. Never
   call a cloud model.

## Hosted version
The first cut can run on the demo (local) store. Do not let hosted buyers search until there is a
database function that returns only passages from items their tier allows, checked server-side.
If you build it, write a migration plus PGlite tests in `demo/production/tests/` proving a buyer
at `After NDA` cannot get text from an `After LOI` item, a declined buyer gets nothing, and the
owner cannot read buyers' question text. Karan applies migrations by hand; put the steps in the PR.

## Done
Everything in "Definition of done" in `AGENTS.md`, plus:
- Unit tests for ranking, exact quotes, synonyms and tier filtering.
- A new e2e (`demo/e2e/ask-room.cjs`, script `e2e:ask`) where a fictional approved buyer asks a
  question, sees a quoted passage with a page number, opens it, and a question with no answer
  goes to the advisor.
- `BUILD_BOARD.md` row 4 set to `In review` with the PR number.

## Not in scope
Summaries of whole documents, answers without quotes, cloud models, emailing anyone.
