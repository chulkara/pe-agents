# Complete hosted sale rehearsal

One fictional HVAC sale, from the first inquiry to the closed handover, performed through the app's own screens against hosted Supabase Auth and Storage. The advisor, seller and buyer each hold their own signed-in browser session at the same time, and every screen is checked at 390, 1024 and 1440 pixels. Nothing is emailed, no paid model is called, and public intake stays paused throughout.

The runner automates every step it can assert reliably, and hands you the browser for the steps that are yours: reading the sourced proposal and recording a judgment, accepting the offer as the seller, and working diligence and closing. A guided step prints what to do and watches the page until it sees the result. The runner never records a review, approval or acceptance on your behalf.

## Before the run

1. **Fixture.** In the Supabase SQL editor, run `production/fixtures/prepare-sale-rehearsal.sql`. It verifies the fictional brokerage and confirmed accounts, keeps intake closed, and records one clearly fictional seller inquiry (the paused public form is itself verified in the browser first). It refuses to run if any real-looking row exists.
2. **Research computer.** The AI drafting steps use the local model only. On this Mac:
   ```sh
   ollama ls   # qwen3:4b at least; qwen3:8b or 14b give a better memorandum
   node --experimental-strip-types scripts/kalling-worker.mjs install
   node --experimental-strip-types scripts/kalling-worker.mjs status
   ```
   If no research computer is paired to the firm, open any deal's Research tab as the fictional advisor and use **Connect this Mac** first.
3. **Build the checked runtime.** From `demo/` on the review branch:
   ```sh
   npm ci && npm run build
   ```

## Running

```sh
node --experimental-strip-types e2e/hosted-sale.mjs run --confirm-fictional --prompt \
  --output "$HOME/Downloads/kalling-sale-rehearsal.json" \
  --shots  "$HOME/Downloads/kalling-sale-rehearsal-shots"
```

Three hidden prompts read the fictional passwords (owner_a as the advisor, seller, buyer). They stay in memory for the run and are never printed or written. `--accounts /absolute/private/path.json` (keys `owner_a`, `seller`, `buyer`, each with `email` and `password`, chmod 600, outside the repository) works like the other hosted runners. The browser opens headed so you can watch and take over; `--from "<step name>"` resumes a broken run at that step after signing every role back in.

Mid-run pause: right after the listing publishes, the runner asks you to run `production/fixtures/mark-rehearsal-listing-sample.sql` so the rehearsal listing is labeled a sample like every other fictional row. It continues as soon as the label is in place.

## What it checks

1. **Public honesty at phone width.** The home page renders, an anonymous visitor can open a listing page with no raw database text, sold validation fixtures stay off the marketplace, and the paused seller form refuses politely.
2. **Qualification to engagement.** The fictional inquiry is qualified; the engagement letter refuses empty fees; the seller signs in their own hosted session and sees only the letter; both signatures open the document requests.
3. **Documents and drafting.** Phone-width uploads; browser text extraction; the recast, teaser and memorandum drafted by the local model and reviewed in the app; anonymity findings resolved before the hosted listing publishes; the memorandum released only after the advisor and the owner both approve.
4. **Data room.** Owner approval before publishing, the watermarked viewer at 390 pixels, logged reads, and the owner's anonymous "who opened what".
5. **Buyer path.** Private-pilot registration, proof upload and advisor verification, the exact NDA, advisor approval, and the confidential details.
6. **Offer to close.** A fictional letter of intent, seller acceptance (guided — the decision is yours), the execution workspace, and the closing to a Sold archive with buyer and seller handover views.
7. **In-app proposal review.** The sourced execution proposal is prepared on the research computer; the runner independently confirms the quotation exists in the stored source text (signed in read-only as the advisor). Each claim has **Show in source**, which marks the quoted words inside the exact permitted passage. You then record your judgment in the app: **Reviewed**, **Changes needed** with a note, or **Dismissed**. The judgment is saved with your name and time, a stale proposal can only be dismissed, and recording a judgment approves nothing, sends nothing and never moves the transaction.
8. **Widths and errors.** Key screens for every role are screenshotted at 390, 1024 and 1440 with a sideways-overflow check, and any page error fails the run.
9. **Final state.** Intake still paused, every lead and listing still clearly fictional, and the report saved outside the repository.

## After the run

The JSON report and screenshots stay in your Downloads folder for review. Record the outcome in `docs/hosted-validation.md` (and the activation folder) only after you have read the report; a passed runner is evidence, not a claim by itself. The sold rehearsal listing remains as a labeled sample archive, off the public rails. CI cannot replace this rehearsal: it uses simulated authentication and model behavior.
