# Brief: Sourcing decisions, saved in the database

Owner: Codex · Branch: `codex/sourcing-decisions-<yyyymmdd>` · Reviewer: Claude · Approver: Karan
Read `AGENTS.md` first. Claim the "Sourcing decisions, saved" row in `BUILD_BOARD.md` in your first commit.

## The outcome
Today the seller sourcing panel (PR #32) keeps everything in memory, and a reload starts over.
That is deliberate: until decisions are saved somewhere safe, an opt-out could be forgotten and a
person written to again. This brief saves decisions in the database, so hosted advisors keep
their work and opt-outs hold permanently, across reloads, devices, advisors and future imports.
That is the step before Karan decides whether to load real license records.

## The risks to design around
- **An opt-out is forever.** Once a license number is marked "Do not contact", no one at the firm
  can move it to any other status, draft or approve a letter for it, or remove it from the list.
  This holds through any function, any role, and any later import. Only a database migration
  could undo it, and that is Karan's call.
- **Decisions only move forward.** The transition table in `demo/lib/sourcing.ts` (`next_`) is
  the rule. Enforce it in the database, not only in the browser. Two advisors acting at once must
  not lose a decision. Check the current status inside the function, with a row lock, and refuse a
  move that is no longer allowed.
- **Nothing is sent.** Approving a letter records who approved it and the exact text. Mailing is a
  person putting a letter in the post, then recording it. No email, no API, no queue.
- **Only the firm sees any of it.** Prospects are not owners, buyers or portal users. No buyer,
  owner, CPA, attorney, helper or anonymous user can read or write a row, or call a function.
- **The approver is the signed-in person.** Record the approver from the account
  (`kalling_private.actor_name()`), not a typed name.

## What exists already (read these)
- `demo/lib/sourcing.ts`: `ProspectStatus`, `Decision`, `setDecision`, the `next_` transitions,
  `OPT_OUT`, and the 4,000-character letter limit. The approval rules: an approver, no `--`, and
  the exact opt-out sentence in the letter.
- `demo/src/advisor/sourcing.tsx`: the panel, with in-memory `useState(emptySourcing)`.
- `demo/lib/sourcingSample.ts`: fictional license records, the only records in scope here.
- `demo/production/migrations/005_brokerage.sql`: `kalling_private.need_advisor()` and
  `kalling_private.advisor_role()` (roles `owner`, `admin`, `analyst`).
- `demo/production/migrations/20261125190000_kalling_dataroom_search.sql` and
  `demo/production/tests/dataRoomSearch.test.mjs`: a recent, reviewed example of the pattern to
  follow. It uses `security definer` functions, explicit grants and revokes, and PGlite tests per
  role.

## Build
1. Migration `demo/production/migrations/<timestamp>_kalling_sourcing_decisions.sql`:
   - Table `kalling_sourcing_decisions`:
     - columns `license_no` (primary key), `status`, `letter`, `approved_by`, `approved_at`,
       `mailed_at`, `note`, `updated_by`, `updated_at`;
     - row-level security on, with no direct table grants to `anon` or `authenticated`.
   - Table `kalling_sourcing_events` (append-only history):
     - columns `license_no`, `from_status`, `to_status`, `by`, `at`, `note`;
     - no update or delete for anyone.
   - `kalling_sourcing_decide(p_license text, p_status text, p_letter text, p_note text)`,
     `security definer`:
     - the caller is an advisor (`need_advisor()`);
     - the status must be one of the seven; the move must be allowed by `next_` from the
       current status (a missing row is `New`);
     - checked under `select ... for update`;
     - "Do not contact" has no way out;
     - approving needs role `owner` or `admin`, a letter of 1 to 4,000 characters, no `--`, and the
       exact `OPT_OUT` sentence; `approved_by` and `approved_at` are set by the function;
     - "Mailed" needs a prior approval; `mailed_at` is set by the function;
     - every call writes one event row;
     - limits: license number 1 to 40 characters, note up to 400.
   - `kalling_sourcing_list()`, `security definer`, advisor only: returns every decision row for
     the panel. (The license records themselves stay in the browser for now, as today.)
2. Store: add a sourcing store with a local version, the current in-memory behaviour, and a cloud
   version calling the two functions. Follow how `dataRoomStore.ts` splits local and cloud.
3. Panel:
   - Load decisions on open, and save each decision through the store.
   - Show "Saved" after each change, and show the function's error in plain words if refused.
   - Keep the demo in memory as it is.
   - Hosted advisors get saved decisions.

## Tests
PGlite, in `demo/production/tests/`. Prove each of these:
- a buyer, an owner, a CPA or attorney, a helper, and an anonymous caller can neither call the
  functions nor read either table;
- an analyst can draft but cannot approve or mark mailed; an owner or admin can;
- "Do not contact" cannot be left by any status move, any role, or a second call;
- a backward move is refused; "Mailed" without approval is refused;
- approval is refused without the exact opt-out sentence, with `--`, or over 4,000 characters;
- two calls that race (one approves, one marks do not contact) both end in a state the
  transitions allow, and both are in the event history;
- event rows cannot be updated or deleted.

Also add unit tests for the store, and extend `e2e/sourcing.cjs` for the local store.

## Done
Everything in "Definition of done" in `AGENTS.md`. In the PR, give Karan the exact Supabase SQL
Editor steps:
1. paste the migration;
2. record it in `supabase_migrations.schema_migrations`;
3. run a read-only check query, and give the expected result.

## Not in scope
- Importing real license records, or any file upload. Karan decides that separately.
- Sending anything. Mailing stays a person's job.
- Cloud models.
- Any change to who can see owner, buyer or listing data.
