# Kalling PE agent system

First working slice: on-market sourcing → screening → returns model, plus a Slack app for owners. Everything runs on test data. Nothing is deployed or connected to real sites, inboxes or Slack workspaces.

## Investment thesis

This is Karan's active thesis. `buybox.json` holds the thesis plus buy-box criteria. The numbers are **market-benchmark estimates**, not confirmed targets:

| Criterion | Value | Basis |
| --- | --- | --- |
| EBITDA | $1M-$5M | Size bands where home-services add-ons trade (GF Data / Axial 2025 via CT Acquisitions) |
| Revenue | $5M-$40M | Implied by $1M-$5M EBITDA at 12-25% margins |
| EBITDA margin | 15%+ | "High-cash-flow" service niches |
| Max price | 6.0x EBITDA | Add-ons typically 3.5-5x; $1-3M EBITDA businesses 4-6x |
| Years in business | 15+ | Family-owned, legacy businesses (e.g. Tucker's Farm's 70-year-old locksmith platform) |
| Debt / exit / hold | 50% / 6.0x / 6 years | Conservative; permanent capital means no forced exit |

Sources: [CT Acquisitions, home services multiples (2026)](https://ctacquisitions.com/?p=3598), [Business Wire, Tucker's Farm locksmith platform (2025)](https://www.businesswire.com/news/home/20250313288677/en/Tuckers-Farm-Corporation-Acquires-One-of-the-Largest-Family-Owned-Locksmiths-in-the-US-10000-Doors-40-Trucks-70-Years-Old-and-Capitalizes-Tech-Enabled-Access-Control-Holding-Company). The thesis is stored with the buy box, so every screening records which version it used.

**To change the thesis later:** edit `thesis.json`, then run `python -m pe.cli set-thesis thesis.json`. That creates a new buy-box version with the same criteria; past screenings keep the version they were scored against. `python -m pe.cli buybox` shows the current one and `buybox-history` lists every version.

- **Rollup power law:** platforms with a long reinvestment runway, targeting $30M+ EBITDA within 4-6 years, then hold or sell.
- **Friction-heavy sourcing:** off-market, family-owned and founder-led businesses over banker-run auctions and public directories.
- **Permanent capital:** no forced exit; cash flow is reinvested.
- **Sector-agnostic platforms:** tech-enabled sub-holding companies in fragmented, high-cash-flow service niches (franchise networks, locksmith and access control).

Ownership is now a screening criterion (`ownership_types`). A listing that doesn't state ownership screens as unknown and is never assumed family-owned. Because the thesis favors off-market sourcing, the off-market agent matters more than the on-market sourcing agent built first.

## What's built

| Part | Status |
| --- | --- |
| Storage, versioned records, write scopes, audit log | Built, tested |
| User-owned buy box (append-only versions, admin only) | Built, tested |
| Durable jobs: checkpoints, retries, idempotency, pause, cancel, schedules | Built, tested (no always-on worker process yet) |
| Approval gate + budgets, enforced in code | Built, tested |
| On-market sourcing agent | Built against fixture sources only |
| Investment analyst: screening + returns model | Built, tested |
| Off-market agent | Drafts and queues outreach only; owner research not built |
| Deal assistant | Not built yet |
| Slack owner app: verified identity, DM intake, channel audience checks, FAQ answers, submissions, review queue | Built, tested against a fake Slack |

## How it fits together

```
admin (you) ──authenticated──> buy box, sources, budgets, identities, approvals
                                   │
sourcing.run job ──> deals + listings + reported facts ──handoff: ready_for_screening──┐
                                                                                        ▼
analyst.screen_ready job ──> screening (pass/fail/unknown + evidence) ──> model (pass only)
                                   │                                      handoff: screened_pass | screened_fail | needs_info
offmarket / slack_app ──request_action──> actions table (pending) ──admin or approved-scope policy──> executor (rechecks) ──> sender
```

- **Deal IDs** are stable hashes of the business key (name + state, or industry + state + rounded financials for anonymized listings), so reruns never duplicate deals.
- **Facts** are append-only rows, each tagged `reported`, `calculated` or `assumption`, with source URL, retrieval date and evidence. Missing numbers are never filled in.
- **Private notes** (`notes`) are separate from shared facts.
- **Handoff states:** `new → ready_for_screening | needs_refresh → screened_pass | screened_fail | needs_info`. New evidence on a screened deal sends it back to `ready_for_screening`. Each agent may only make the transitions in `pe/records.py: WRITE_SCOPES`.
- **Concurrent writes** use optimistic locking (`version`); the loser gets `ConflictError`. Every version is kept in `history`.
- **Approvals:** agents have no senders. `approvals.execute` refuses anything not approved, rechecks identity, audience and budget right before sending, and claims the send before calling the sender so a retry can't send twice.
- **Budgets:** routine spend (e.g. model calls) inside a budget you configured with `--auto` proceeds without per-call approval. Spend with no budget, over the limit, or in a non-auto category is refused.
- **Untrusted content:** listing text, emails, Slack messages and attachments are stored as data and scanned for instruction-like text, which is flagged for review. No code path executes instructions from content.

## Slack owner app

Two roles, kept separate. Neither can see the internal pipeline, valuations, screening scores, outreach, investor data or other companies.

| | Acquisition prospect (`prospect_owner`) | Portfolio operator (`portfolio_operator`) |
| --- | --- | --- |
| Approved FAQs | Global + their company, prospect audience | Global + their company, operator audience |
| Submit updates / documents | Yes, stored as unverified, attributed submissions | Yes |
| Meeting requests | Queued, never booked automatically | Same |
| Anything else | Your review queue | Your review queue |

- Identity = Slack (team ID, user ID) mapped by you, with a note on how you verified them. Display names and claims are ignored. Unknown or revoked users get only the onboarding reply.
- Before answering in any conversation, every member is checked: guests, external shared-channel users, unknown bots or members from another company block disclosure.
- Auto-replies are allowed only when the text exactly matches approved content or a fixed acknowledgement. Everything else, including valuations, terms, commitments and mentions of other companies, goes to the review queue, where you see the exact text and audience before sending.
- Requests are signature-checked with a 5-minute replay window, and duplicate deliveries are dropped by event ID.
- Least-privilege scopes are listed in `pe/slackapp/api.py`. Secrets come from environment variables only.

## Quickest way to try it

```bash
python3 -m pe.cli demo      # Windows: py -m pe.cli demo
```

This sets up test data, prints your demo admin secret, and opens the dashboard at http://127.0.0.1:8787. It uses `demo.sqlite`, separate from any real database.

## Dashboard

```bash
python3 -m pe.cli dashboard          # then open http://127.0.0.1:8787
```

Sign in with your admin secret. The dashboard shows:

- **Pipeline:** every deal with its stage, financials, price multiple and flags. Click a deal to see each buy-box check with its evidence, what each source reported, the returns model (assumptions kept separate), open questions, the raw listings and version history. You can run sourcing and screening from here.
- **Approvals:** every draft waiting for you, with the exact text and recipient. Approving marks it approved; nothing is sent until a real sender (email or Slack) is connected.
- **Jobs:** status and progress, with pause, resume and cancel.
- **Activity:** the audit log.

It only accepts connections from your own computer (127.0.0.1). Changes need a per-session security token, sign-in locks for 5 minutes after 5 wrong tries, and listing text is always shown as plain text, never run as code.

## Run it

```bash
pip install pytest
python -m pytest -q                      # 32 tests

export PE_DB=demo.sqlite
export PE_FIXTURE_SOURCES='{"source_a":"tests/fixtures/source_a.json","source_b":"tests/fixtures/source_b.json"}'
python -m pe.cli init-admin karan        # prints the admin secret once
export PE_ADMIN_SECRET=...               # required for admin commands
python -m pe.cli set-buybox test-buybox.json --label TEST
python -m pe.cli approve-source source_a --terms "fixture data"
python -m pe.cli source --sources source_a
python -m pe.cli screen
python -m pe.cli deals
python -m pe.cli deal <deal_id>          # facts, screening evidence, model, open questions
python -m pe.cli queue                   # pending approvals
```

### Pause or cancel a job

```bash
python -m pe.cli jobs                    # list jobs and statuses
python -m pe.cli pause  <job_id>         # stops after the current item; checkpoint kept
python -m pe.cli resume <job_id>         # then: python -m pe.cli worker
python -m pe.cli cancel <job_id>         # stops after the current item; won't run again
```

## Known limitations

- Fixture sources only. Real broker and marketplace adapters need approved sources and a terms-of-service check for each site.
- No always-on worker or real scheduler process yet: `worker` and `jobs.tick` work when called but nothing calls them on a timer.
- SQLite, not Postgres. The schema is portable, but concurrency was only tested with SQLite's single-writer lock.
- Cross-source matching of anonymized listings uses rounded financials and can miss or over-match; possible matches are logged as notes for review.
- The returns model is a simple levered scenario with no fees, working capital or seller notes, and every input assumption is yours.
- Slack intent routing uses rules, not a model, so it is conservative and sends a lot to review. Attachments are logged and quarantined but never opened.
- The admin secret is a single shared secret. A real deployment needs per-person login and secret storage.
- Untested against real Slack, real email or real model calls.
