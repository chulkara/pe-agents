# AI drafting: recast, teaser, memorandum and comparable sales

The research computer (the Mac worker running a local Qwen model through Ollama) drafts four things from the owner's accepted documents. Each draft is a proposal. An advisor accepts, edits or skips every part, and nothing reaches a buyer until a person has approved it.

Ground rules that apply to all four:

* **Every figure has a source.** The model must cite the file, the page and a short excerpt. The excerpt has to appear on that page and contain the exact signed amount, matched to cents. The cited year must appear in the excerpt or be unambiguous on the page or file name. Near amounts, reversed signs, missing years and ambiguous year columns are rejected. The browser checks returned recast lines again, including results from older workers. Anything without a source is shown as "Needs confirmation".
* **Arithmetic happens in code.** The model extracts numbers; `lib/recastDraft.ts` and `lib/cim.ts` do every sum, trend and comparison.
* **Stale drafts are flagged.** Each draft records a fingerprint of its inputs. If a document, answer or recast changes later, the draft shows "Inputs changed since this draft" with **Run a fresh draft** or **Use anyway** (which needs a note).
* **Nothing is sent automatically** and no paid service is used.

## From documents to text

When an advisor accepts a document request, the browser reads each file page by page (`lib/extract.ts`): PDFs with pdf.js, CSV, XLSX and DOCX directly. Pages with fewer than 40 characters are treated as scanned and flagged "Scanned, needs typing or OCR"; they are left out of drafts. The text is saved privately for the firm (`kalling_portal_file_text`, migration 007) and can be read again with **Read again**.

## Packets and the worker

`lib/drafting.ts` builds a packet for each kind from accepted documents only. Limits: 600 KB for recast and memorandum packets, 120 KB for the others. The database enforces the same limits and refuses work for workers older than `kalling-worker-2` (migration 007).

`scripts/local-drafting.mjs` runs each packet:

* Output must match a JSON schema. Invalid output is sent back to the model with the error, up to two retries.
* Each call has an 8,000-token budget.
* Progress reads like "Reading pl-2024.pdf, page 1...".
* A larger model can be set per kind in `~/.kalling-agent/worker.json`, for example `{"models":{"cim":"qwen3:14b"}}`. Allowed models are `qwen3:4b`, `qwen3:8b` and `qwen3:14b`.

## Earnings recast

**Draft recast** on the Valuation and recast tab returns extracted lines and proposed add-backs. The review table shows, per line:

* the amount, the citation (click it to open the page), and a support rating;
* **Accept**, **Edit** or **Skip**.

The table also flags any year where profit and loss differs from the tax return by more than 2%, with both citations. Add-backs with weak support (no document, round numbers, personal items such as family payroll) are marked "Ask the owner" and skipped by **Accept supported, skip the rest**.

**Apply accepted lines** saves a new recast version with the full accept/skip decisions, the original reported amounts and excerpts, and the applied advisor amounts. Skipped lines remain in review history. The memorandum uses this saved recast, never the raw extraction table. Its financial sources show each file, page and excerpt and distinguish advisor adjustments from reported amounts. Historical extraction rows stay in the proposal table until separately reviewed; they are not released as reviewed financial statements. Losses retain their sign. Manual or legacy recasts without document citations need explicit confirmation before release. An older memorandum, or one whose recast changes, needs a fresh memorandum draft and new advisor and owner approvals. Partial section regeneration is available only while its source snapshot is current. Earlier versions stay in the history on the Materials tab with a diff. If the firm has entered a baseline in Firm settings ("Minutes a recast takes by hand"), the confirmation says roughly how much time the draft saved. With no baseline, it says nothing.

## Anonymous teaser

**Draft teaser** on the Listing tab writes the headline, summary, highlights and growth points from the applied recast and the owner's answers. The anonymity checker (`lib/anonymity.ts`) runs on the draft and on the listing form:

* **Blocking:** the business name or close variants, the owner's name, the city or nearby towns, phone numbers, emails, street addresses, license numbers, the website.
* **Warnings** (need a note): the founding year, exact counts that could identify the company.

Each finding has **Use suggestion** where a safe rewrite exists. Migration 008 runs the same checks in the database when a listing is saved or published, using the same fixture file (`tests/fixtures/anonymity-cases.json`) so the browser and database cannot drift apart.

## Confidential memorandum (CIM)

The Materials tab drafts the memorandum in 12 sections. The financial summary, the cover and the disclaimers are written by code from the reviewed recast; the rest by the model, from numbered sources (F for figures, Q for owner answers, D for documents, R for research).

* Every paragraph lists its sources. A paragraph with none is highlighted and blocks release until the advisor adds a source, confirms it with a note, or removes it.
* A privacy scan looks for customer names, employee names, license numbers and other personal data. Advisors can list names to watch for under **Private names**.
* **Regenerate this section** redrafts one section; comments are kept per section.
* Release takes two approvals: **Approve as advisor**, then the owner approves in the portal under "Your memorandum" (or asks for changes on specific sections, which come back as comments).
* **Download PDF** produces the memorandum with a confidentiality stamp on every page.

The owner's "About your business" questions in the portal feed the history, services, strengths, team and transition sections.

## Comparable sales

**Comparable sales** (advisor menu) is the firm's library. Entries come from manual entry, CSV import, Kalling's own closed deals (added automatically at the accepted price), or **Extract from a page**, where the model proposes entries from a web page and the advisor confirms each one.

On a deal's Valuation tab, comps are ranked by code (region, size, kind of work, recency); the model only writes commentary on the ranked list. With fewer than three confirmed comps it says so plainly instead of drawing a conclusion. Comps are internal by default.

## Where drafts show up

* The Deal Room header's primary action follows the next unfinished step (Draft recast, Draft teaser, Draft CIM).
* **Today** lists drafts ready for review, memoranda with owner changes requested, and drafts whose inputs changed.

## Tests

`tests/draftingWorker.test.mjs`, `tests/materials.test.mjs`, `tests/anonymity.test.mjs`, `tests/extract.test.mjs`, and `production/tests/drafting.test.mjs` and `anonymity.test.mjs` for migrations 007 and 008. The end-to-end script `e2e/seller-flow.cjs` uses a scripted fake Ollama (`e2e/fake-ollama.mjs`) with planted mistakes: a wrong amount, a town in the teaser and an unsourced sentence in the memorandum. All fixtures are labeled "Fictional sample, not real financial data".
