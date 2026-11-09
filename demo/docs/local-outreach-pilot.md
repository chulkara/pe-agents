# Local Qwen outreach drafting

Outreach now uses the local Qwen model through the same guarded worker as
research. The earlier fixed-template form has been removed. A source-review
badge is not evidence that a new writing assignment has run.

## Update the Mac worker first

Refreshing the website does not update downloaded scripts. If you cloned the
repository, pull the latest changes without discarding local modifications:

    git pull --ff-only

If you originally downloaded a ZIP, download a fresh copy using GitHub's
**Code → Download ZIP**, extract it, and enter its **demo** folder in Terminal.
Keep the previously downloaded assignment/result files and ~/.kalling-agent
checkpoints; do not delete them. No new npm dependency is needed for this worker.

Alternatively, from your existing demo folder, update these five worker files:

    curl -fsSL https://raw.githubusercontent.com/chulkara/pe-agents/main/demo/lib/agentProtocol.ts -o lib/agentProtocol.ts
    curl -fsSL https://raw.githubusercontent.com/chulkara/pe-agents/main/demo/lib/outreachTemplates.ts -o lib/outreachTemplates.ts
    curl -fsSL https://raw.githubusercontent.com/chulkara/pe-agents/main/demo/lib/outreachProtocol.ts -o lib/outreachProtocol.ts
    curl -fsSL https://raw.githubusercontent.com/chulkara/pe-agents/main/demo/scripts/local-agent-runner.mjs -o scripts/local-agent-runner.mjs
    curl -fsSL https://raw.githubusercontent.com/chulkara/pe-agents/main/demo/scripts/local-research.mjs -o scripts/local-research.mjs

Update all five; mixed versions stop before processing. Keep Ollama running in
the already verified local-only configuration, then check:

    node --experimental-strip-types scripts/local-research.mjs doctor

The worker requires the live Ollama cloud-disabled flag before model metadata
and each inference request. It is fixed to 127.0.0.1:11434, permits only the local
qwen3:4b / qwen3:8b names, rejects cloud aliases and redirects, and has no paid or
hosted fallback. Existing local research assignments remain supported.

## Prepare and run

1. Open a real company, finish source review, and review a current **Call brief**.
2. Open **Outreach → Local Qwen drafting**.
3. Confirm a buyer introduction: full professional name, actual firm/search name,
   truthful background and acquisition objective. Demonstration identities are
   rejected. This profile is separate from the sample workspace's firm identity;
   no sample biography or capital claim is assumed.
4. Select one to eight reviewed public company statements. Confirm the correct
   recipient name or leave it blank for further research. No ownership status,
   gender or title is inferred.
5. Optionally enter internal drafting notes. For example, "Location is ideal for
   target" is guidance to evaluate, not a sentence to insert into the email and
   not evidence of a geographic fact. The model must use the selected evidence
   and confirmed objective to write a relevant sentence, or omit the point.
6. Export the writing assignment. It contains the chosen buyer introduction,
   public source statements, recipient name and notes. The company contact email,
   uploaded documents, owner conversations, credentials and other companies are
   not included. Text you enter into the buyer introduction or notes is included.
7. Run the downloaded assignment from demo, using its actual file path:

       node --experimental-strip-types scripts/local-research.mjs run "$HOME/Downloads/kalling-outreach-ASSIGNMENT_ID.json"

8. Import the printed **result.json** under **Import Qwen outreach result**.
   Use Command-Shift-G in the Mac file picker to open its hidden directory.

A one-call model proposal contains an introduction, a company-specific relevance
paragraph and a clear request for a conversation, with references outside the
email text. The application adds the confirmed signature and named salutation.
Unknown recipient names become a visible placeholder that blocks final approval.
A named contact must still be checked; it does not establish legal ownership.

## Review and use

The imported draft is unreviewed. Open each paragraph's references and compare
its interpretation with the buyer statements and exact source excerpts. A valid
reference ID does not establish semantic accuracy. Check that the prose does not
invent credentials, funding, transaction history, financials, willingness to sell,
personal familiarity or operating commitments.

Edit the draft and verify the exact recipient. Every revision loses its prior
approval. Approve the exact wording only after checking every claim and the tone.
Copying or downloading a reviewed draft does not send it.

Earlier drafts and source trails remain in preparation history. The previous
fixed-template draft is visibly marked for replacement. The source quotations
remain in the review interface rather than being automatically pasted into the
message. Ordinary manual editing remains possible; edited text still requires
human review.

A new buyer-profile confirmation, changed buyer-profile contents, company/source
changes or a superseded call brief invalidate pending imports. Profile changes
also invalidate generated-draft approvals. Wrong-company/firm, repeated,
cancelled, old-policy and hosted-provider results are rejected.

## Recovery and cost

Ctrl+C pauses a job. Rerun the same command to resume its saved checkpoint.
The shared runner preserves token accounting, attempt counts and the model digest.
A completed result is revalidated and reopened without new inference calls.
Outreach permits at most two attempts in total per assignment, with no silent
fallback to canned text. Validation errors are included as feedback on the
second attempt. If a valid draft needs a different emphasis, change the notes
and export a new assignment rather than deleting the journal.

Local model API charge: $0. Storage, electricity, internet and hardware are
excluded. Ollama inference is local; the broader Kalling app can still use its
existing public-page reader and configured cloud workspace storage.

## Validation limits

Automated tests use simulated model responses to verify privacy boundaries,
input binding, local-only checks, source references, review gates and recovery.
They do not establish that Qwen3-4B writes good acquisition correspondence.
The first actual Mac output must be reviewed before claiming writing quality
or time savings. No real owner has been contacted by these tests.

The uploaded Vault career guide contained employment correspondence, not seller
acquisition letters. This playbook uses original instructions for professional
acquisition writing; it does not claim to reproduce seller templates from that
guide or include the guide in this public repository.
