# CPA and attorney access

A seller or buyer can give their own CPA or attorney a private login. The party, not the brokerage, decides what each professional may open.

## How it works

- **The party adds them.** From the owner portal (sellers) or the buyer account page, add a name, email, firm and role (CPA or attorney), and how long access lasts (30 days to a year). Up to six per party. Kalling creates a one-time invitation link; it does not email it. The party sends the link themselves.
- **The professional signs in.** At `#/professional`, with the invited email address. In the hosted product they create their own password and confirm their email; the invitation only works for that email, once. Before anything is listed, they agree to keep the documents confidential.
- **The party shares document by document.** The picker lists only what the party can open themselves right now: data-room documents and closing documents shared with them. Buyers confirm that the professional is bound to confidentiality and that they remain responsible under the listing NDA (clause 2 already allows sharing with advisors).
- **Access is re-checked as the party, every time.** If the party can no longer open a document (the room is unpublished, the buyer is restricted, a newer version replaces it, the brokerage withdraws a closing-document share), the professional loses it at once. Stopping a share, removing the professional or expiry also end access immediately.
- **The party sees every open.** Each open is logged, allowed or denied, and listed under the professional's activity. Every page carries the professional's name, email, role, client and date as a watermark.

## Security model (hosted)

Migration `20261123170000_kalling_professional_access.sql`:

- Private tables in `kalling_private` with no direct client access. Invitation tokens are stored only as SHA-256 hashes.
- Every action is a `security definer` function. Party functions identify the caller as the buyer profile or the seller's active portal; professional functions require a confirmed account whose email matches the invitation.
- Reads go through `kalling_pro_open`, which logs first and issues a two-minute ticket for one object. The storage policy `kalling_pro_read` allows only authenticated downloads (no signed URLs) for that user, ticket and object, while the share and the party's own access still hold.
- Tests: `production/tests/professionalAccess.test.mjs` (database and storage policy) and `tests/professionals.test.mjs` (the same rules in the browser demo).

## Not covered yet

- The seller's raw uploads in the owner portal that are not in the data room or the closing workspace. Add them to the data room or closing documents to share them.
- Previews cover PDFs and images. Spreadsheets show a message asking for a PDF.
- No downloads; professionals read in the watermarked viewer.
- The brokerage does not see the professionals list. Decide whether advisors should see who each party has appointed.
