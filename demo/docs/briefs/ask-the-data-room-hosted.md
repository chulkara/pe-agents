# Brief: Ask the data room, hosted

Owner: Codex · Branch: `codex/ask-data-room-hosted-<yyyymmdd>` · Reviewer: Claude · Approver: Karan
Read `AGENTS.md` first. Claim the "Ask the data room, hosted" row in `BUILD_BOARD.md` in your first commit.

## The outcome
Hosted buyers and advisors get the same "Ask the data room" that the demo has (PR #30), with the
rules enforced by the database, not the browser. Today the search box is hidden for hosted users.

## The risk to design around
A buyer must never get more text than they could see by opening documents in the viewer:
- only items that are owner-approved and open for the buyer's tier (`After NDA` or `After LOI`);
- never whole pages in bulk: a search returns at most 5 passages of at most 600 characters each, so
  search cannot be used to copy a document that is view-only;
- a declined, withdrawn or revoked buyer gets nothing.

## What exists already (read these)
- `demo/lib/askRoom.ts` and `demo/src/AskRoom.tsx`: demo search and the shared screen.
- `demo/lib/dataRoomStore.ts`: local `search`, and the cloud store (no `search` yet).
- `demo/production/migrations/009_data_room.sql`: `kalling_private.dataroom_tier`,
  `kalling_private.dataroom_visible`, the room and item tables, `kalling_dataroom_events`.
- `demo/production/migrations/20261113032739_kalling_dataroom_revocation.sql`: revocation rules.
- `demo/production/migrations/007_drafting_jobs.sql`: `kalling_portal_file_text`, the stored page
  text per file (`pages` jsonb of `{page,text}`), readable only by the firm today.

## Build
1. Migration `demo/production/migrations/<timestamp>_kalling_dataroom_search.sql`:
   - Table `kalling_dataroom_searches(listing_id, buyer_id, question, at)` with row-level security:
     the firm reads everything; the buyer reads their own rows; the owner reads nothing (owners get
     the count through a function).
   - `kalling_dataroom_search(p_listing uuid, p_question text)`, `security definer`, returning
     `[{item_id, display_name, page, quote, score}]`:
     - the caller is a buyer with a tier for this listing, or the firm (firm searches all items
       except owner-removed ones and does not log a row);
     - candidate pages come only from items visible to that caller, joined to
       `kalling_portal_file_text` by file;
     - ranking with Postgres full-text search (`to_tsvector('english', ...)`,
       `websearch_to_tsquery`), with the same HVAC synonyms as `askRoom.ts`;
     - each `quote` is an exact substring of the stored page text, at most 600 characters, around
       the best match; at most 5 results;
     - rate limit: 30 searches per buyer per hour, with a plain-words error;
     - question length 2 to 3000 characters; buyer searches insert one row.
   - Count of searches for the owner's weekly summary through the existing weekly function or a new
     owner function that returns only the number.
2. Cloud store: add `search(listingId, question)` calling the function, and fill `searches` and
   `searchQuestionCount` in the advisor room. Then show `AskRoom` for cloud too (remove the
   `mode==='local'` gates).
3. Advisor results: label documents the owner has not approved yet ("Not yet approved by the
   owner"), in both demo and hosted.

## Tests (PGlite, `demo/production/tests/`)
Prove each of these:
- a buyer at `After NDA` gets no text from an `After LOI` item;
- a declined or revoked buyer, a stranger and the owner get nothing from the search function;
- an owner-removed item never appears, for buyer or firm;
- quotes are substrings of stored text and at most 600 characters; at most 5 results;
- the 31st search within an hour fails;
- the owner cannot read question text; the firm can.

## Done
Everything in "Definition of done" in `AGENTS.md`. In the PR, give Karan the exact Supabase SQL
Editor steps: paste the migration, record it in `supabase_migrations.schema_migrations`, and a
read-only check query with the expected result.

## Not in scope
Model-written answers, cloud models, any change to who can open documents.
