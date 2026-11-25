# Kalling: rules for every AI that works in this repo

Read this file before every task. It applies to Claude Code, Codex, and any other AI.
Karan (chulkara) owns the product and approves every merge. You build; he decides.

## What Kalling is
An AI-native brokerage for $1M to $5M HVAC companies in New Jersey and New York. Agents do the
grunt work, people confirm. "The Apple of business brokerage": frictionless for owners who are not
technical, without compromising security, legality or diligence. The app lives in `demo/`.
The product record (strategy, ideas by priority, shipped updates) is the Google Doc
"Kalling Master Document". Karan or Claude updates it; you do not need access to it.

## Hard rules
1. Never merge, deploy, apply a database migration, activate public intake, or change anything
   outside this repo without Karan's explicit approval in the conversation.
2. Never auto-send or auto-approve. Anything that reaches an owner, buyer, lender or anyone outside
   the firm is a draft that a named person approves.
3. Fictional data only. No real owners, buyers, emails, phone numbers or financials in code,
   fixtures, tests or screenshots.
4. Models stay local (Ollama, `qwen3:4b|8b|14b`, see `demo/lib/agentProtocol.ts`). No paid APIs,
   no cloud model calls, no new third-party services.
5. No service-role keys or secrets in the browser or the repo. Database access goes through
   row-level security and `security definer` functions with explicit permission checks.
6. Numbers are computed in code, never written by a model. Every figure an owner or buyer sees
   must trace to a source (document and page, or a named input).
7. Write `-`, never `--`, in any user-facing text.
8. Plain words for owners: sentence case, no jargon, say what happens next.

## Lanes: who works where
- Claude Code works on branches named `claude/<feature>-<yyyymmdd>`.
- Codex works on branches named `codex/<feature>-<yyyymmdd>`.
- Never commit to another AI's branch, and never to `main`. One feature per branch and PR.
- Before starting, claim the item in `BUILD_BOARD.md` (owner, branch, status `Building`) in your
  first commit. If an item is already claimed, stop and say so.
- If your work must touch a file another open PR is changing, say so in your PR description.

## Definition of done (before asking Karan to merge)
Run from `demo/`:
- `npx tsc --noEmit -p .` passes.
- `npm test` passes (unit and database permission tests).
- `npm run build` passes.
- With the dev server running (`npm run dev -- --host 127.0.0.1 --port 4173`): `npm run e2e`,
  `npm run e2e:seller`, `npm run e2e:execution`, `npm run e2e:sample`, `npm run e2e:matches`
  pass, plus any new e2e you added.
- New logic has unit tests; new screens are checked at 390px wide with no sideways scroll.
- Database changes: a new file in `demo/production/migrations/` plus PGlite tests in
  `demo/production/tests/` that prove who can and cannot read and write. Karan applies it by hand
  in the Supabase SQL Editor; write the exact steps in the PR.
- `BUILD_BOARD.md` row updated to `In review` with the PR number.
- The PR description says what changed for owners, buyers or advisors, what was checked, and
  anything Karan must do.

## Reviewing the other AI's PR
When Karan asks you to review a PR from the other lane, read the diff and report only real
problems: bugs, permission or privacy leaks, broken rules above, missing tests. Post findings as a
PR comment or in the conversation. Do not push to their branch.

## Commits and PRs
- Commit messages end with your own attribution line (for example `Co-Authored-By:` for Claude).
- Keep PRs to one feature. Stacked PRs are fine if each is labelled "Stacked on #N".
