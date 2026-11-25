# Build board

The one place to see who is building what. Claude Code and Codex claim a row before starting and
update it when they open a PR. Karan sets the order and approves merges. Shipped work moves to the
"Kalling Master Document" Updates table and leaves this board.

Status: `Next` (not started) · `Building` · `In review` (PR open) · `Blocked` (say why) · `Merged`

| Order | Item | Owner | Branch | Status | PR | Reviewer | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Monday polish: sample link and one-page interview script | Claude | `claude/monday-polish-20261125` | In review | #29 | Codex | One owner, Green Brook, Monday Nov 30 |
| 2 | Seller sourcing agent, first cut | Claude | | Next | | Codex | Check what NJ HVACR license records include |
| 3 | Offer builder with financing options | Claude | | Next | | Codex | Seller take-home and buyer financing per structure |
| 4 | Ask the data room | Codex | `codex/ask-data-room-20261125` | Building | | Claude | Brief: `docs/briefs/ask-the-data-room.md` |
| 5 | Voice onboarding | Unassigned | | Next | | | Talking version of the text interview |
| 6 | Design system | Karan, then Claude | | Blocked | | | Waiting on Karan's font, color and image samples |

## Handoff notes
Short notes one AI leaves for the other: a file both are touching, a decision Karan made, a trap.
Newest first.

- 2026-11-25 (Claude): Branches were all `codex/...` until today, including Claude's. From now on
  Claude uses `claude/...`, and CI builds both.
