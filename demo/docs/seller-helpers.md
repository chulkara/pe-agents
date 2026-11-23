# Seller staff helpers

An owner can give someone on their staff (an office manager, bookkeeper or controller) a narrow login to gather records. The helper does the fetching; the owner stays in control of what reaches Kalling.

## What a helper can and cannot do

- **Sees:** only the document requests the owner assigns, by title, description and due date. Their own uploads and the owner's decisions on them.
- **Never sees:** why a document is needed or who will see it (those fields often mention buyers), other requests, buyers, offers, prices, the engagement letter, messages, the memorandum, or data-room activity.
- **Uploads wait for the owner.** Nothing a helper sends reaches Kalling until the owner approves it. Approved files become the owner's own upload on that request, labeled "gathered by" the helper. The owner can send a file back with a reason, and the helper can withdraw a file that is still waiting.
- **The owner controls access.** Up to four helpers, access for 30 days to a year, assignments changed at any time, removal ends access immediately and discards waiting files. Requests close to helpers when they are accepted, and the whole portal closes to them if requests are hidden again.

The helper's page (`#helper`) is separate from the public site and says nothing about a sale, but it carries the Kalling name. The owner panel says so, because staff learning about a sale too early is the main risk this role carries.

## Hosted

Migration `20261123190000_kalling_seller_helpers.sql`:

- Private tables in `kalling_private`; invitation tokens stored only as SHA-256 hashes.
- Helper files go to `helper/<portal>/<id>` in the owner-portal bucket but are **not** rows in `kalling_portal_files`. Every brokerage read path (table policy, `kalling_portal_download`, ticketed data-room and closing reads) depends on those rows, so the brokerage cannot read a helper file before approval. Only the helper can upload to a reserved path, and only the owner can read a waiting file (authenticated downloads only, no signed URLs).
- Approval inserts the portal file under the owner's account and links it with the existing `kalling_portal_link`, so every existing request rule applies.
- The same migration adds `kalling_pro_advisor_list`, the brokerage's read-only view of each side's CPA and attorney (name, role, firm, status), shown on the deal room's Owner tab. What each party shares with them, and when they open it, stays private to that party.
- Tests: `production/tests/sellerHelpers.test.mjs` and `tests/helpers.test.mjs`.
