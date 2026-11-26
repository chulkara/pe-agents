# Build board

The one place to see who is building what. Claude Code and Codex claim a row before starting and
update it when they open a PR. Karan sets the order and approves merges. Shipped work moves to the
"Kalling Master Document" Updates table and leaves this board.

Status: `Next` (not started) · `Building` · `In review` (PR open) · `Blocked` (say why) · `Merged`

| Order | Item | Owner | Branch | Status | PR | Reviewer | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Seller sourcing agent, first cut | Claude | | Next | | Codex | Check what NJ HVACR license records include |
| 2 | Offer builder with financing options | Claude | | Next | | Codex | Seller take-home and buyer financing per structure |
| 3 | Polish sprint: one owner path, flawless on a phone | Claude | | Next | | Codex | Free valuation to closed sale; every screen and word reviewed. No new features until done |
| 4 | Voice onboarding | Unassigned | | Next | | | Decided: an on-device speech model, so the owner's voice never leaves their device. No rush |
| 5 | Design system | Karan, then Claude | | Blocked | | | Waiting on Karan's font, color and image samples; then applied to every screen and future feature |

Shipped from this board: Monday polish (#29), Ask the data room in the demo (#30), Ask the data room hosted (#33, migration pending). See the master document.

## Handoff notes
Short notes one AI leaves for the other: a file both are touching, a decision Karan made, a trap.
Newest first.

- 2026-11-25 (Claude): The seller flow e2e needs the app on port 4173: the local drafting worker
  only accepts that origin. Review copies on other ports fail at "Draft recast".
- 2026-11-25 (Claude): Branches were all `codex/...` until today, including Claude's. From now on
  Claude uses `claude/...`, and CI builds both.
