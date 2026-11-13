# Owner portal

An invited business owner gets one private page for their sale. It shows:

* **Their business.**
* **Next steps:** what they need to do and what your team will do.
* **Document requests.** Each request says what is needed, why, who can see it, and whom to contact.
* **Interested buyers.**
* **Messages** with your team.
* **Their documents.**

Owners never see your workspace, notes, research, other companies or other portals.

## Firm side

Open a company's Deal Room. **Documents** holds the requests and files; **Owner** holds messages, next steps, buyers, the invitation link, settings and the owner's view. **Start engagement** on a seller inquiry drafts the portal for you with the first six HVAC requests.

1. **Create the portal.** Enter the owner's name and email, a help contact and an optional welcome note.
2. **Request documents.** Start from a common HVAC request: profit and loss statements, tax returns, year-to-date financials, the maintenance agreement list, licenses and insurance, a team overview, customer and revenue mix, vehicles and equipment, or the lease. Edit every field so it reads plainly. Each request must include:
   * what is needed
   * why it is needed
   * who can see it
   * a contact for questions
3. **Add buyers** and **next steps.** Everything on these tabs is visible to the owner. List only buyers who agreed to be named.
4. **Create an invitation link** and send it yourself. Kalling sends no email. The link works once, only for the owner's email address, and expires after 14 days. Creating a new link cancels the old one.
5. **Review what comes back.** Download the files, then **Accept**, **Ask for a change** with a note, or mark the request **Not needed**. **Owner's view** shows exactly what the owner sees.

Changing the owner's email, or closing the portal, removes the earlier owner's access immediately. Records are kept.

## Owner side

What the owner sees depends on where the engagement is:

* **Before signing:** only the engagement letter, to read and sign (`docs/engagement.md`).
* **After both sides sign:** document requests, next steps, buyers and messages.
* **Your memorandum:** the confidential memorandum to approve, or to send back with notes on specific sections.
* **About your business:** five plain questions (history, services, strengths, team, after the sale) that feed the memorandum. Answers save as the owner types.
* **What buyers will see** and **Who opened what:** the data room documents to approve or keep private, and which anonymous buyers opened each one (`docs/data-room.md`).


The portal uses the same design as the public site: the business name at display size with "Prepared by Kalling for" the owner, a purple help panel with the contact, progress figures with a bar (green for complete, periwinkle for sent), requests as an accordion sorted needs a change, in progress, to do, sent, complete, buyer cards with their stage explained, and a message thread where the owner's messages are purple and Kalling's are periwinkle. On a phone it is one column with a bar at the bottom for **Messages** and **Upload**; every control is at least 44px tall.


The owner opens the link, signs in or creates an account with the invited email, and lands on their portal. They can come back any time at the same address with `#owner` at the end.

* **Progress saves as they go.** Each file is stored when it finishes uploading, and notes save automatically. A request shows "Saved, not sent yet" until the owner presses **Send for review**. Leaving and returning keeps everything.
* **Documents they already provided are remembered.** Uploading the same file again links the earlier copy instead of storing a duplicate, and the owner is told when that happens. Any earlier document can also be reused for another request.
* **Requests that need a change** move to the top, with your note explaining what is missing.

## Security and limits

* **Database tables.** Migration `production/migrations/004_owner_portal.sql` adds owner-scoped tables and a private `kalling-portal` storage bucket. Access is decided by the database:
  * Firm members read the portal according to their role.
  * The owner gets access only after accepting an invitation, with a confirmed account whose email matches the invited address.
* **Invitation tokens.** Tokens are random and stored only as SHA-256 hashes.
* **Uploads.** Files can only go to a path the uploader reserved, and are checked against the reserved size and type before they count as stored.
* **Downloads.** Downloads re-check portal access every time.
* **Pilot limits:**
  * 10 MB per file, 100 files and 200 MB per portal
  * 40 requests, 20 buyers and 12 next steps per portal
  * 50 portals per firm
* **Tests.** `production/tests/ownerPortal.test.mjs` runs these rules against real PostgreSQL. `tests/portal.test.mjs` covers the same behaviour in the browser demo store.

**Before inviting a real owner:** Supabase's default email service only delivers confirmation emails to project team addresses. An outside owner can't confirm a new account until a custom SMTP sender is configured in Supabase Authentication, or until an administrator creates and confirms the account from the dashboard.

## Local demo

Without a cloud account, the portal works entirely in one browser. Records are kept in local storage and file contents in IndexedDB. **Open as the owner** opens the invitation in a new tab, where the owner enters the invited email instead of a password. This is for demonstration only. Use a cloud firm for real owners.

Buyer financing evidence is covered in [buyer verification](buyer-verification.md). Seller badges use the current reviewed version and never include proof documents or buyer identities. NDA access remains a separate advisor decision.

The [offer comparison](offer-comparison.md) shows only exact terms versions shared by an advisor, with current anonymous verification badges. The owner can ask questions or record a preference against that version. Revised offers require fresh sharing and a new owner decision; a preference does not sign or accept an LOI.
