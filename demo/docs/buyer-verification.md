# Buyer financing evidence

Buyers save an evidence draft, upload up to three PDF, PNG or JPEG files (10 MB each), and submit a frozen version. A replacement immediately removes the previous badge. An authorized advisor reviews the exact file IDs, records a buyer-visible explanation separately from a private note and chooses an expiry. The default freshness policy is 90 days, capped by any stated document validity. A house owner or administrator can configure 1 to 365 days. Existing reviews retain their original expiry.

A verified badge means financing evidence was reviewed. It does not guarantee identity, creditworthiness, funding or closing and does not grant per-listing NDA access. Sellers see the current badge and a stable anonymous label only. Legacy Verified account statuses do not count as reviewed evidence.

## Deployment

Apply existing migrations 003 through 011, then `20261113032739_kalling_dataroom_revocation.sql`, then `20261113054256_kalling_buyer_verification.sql`. Preserve previously applied migrations. The live project currently has foundation tables only; local tests are not hosted validation.

Deploy `production/functions/kalling-verification-file/index.ts` as `kalling-verification-file`. It authenticates the requesting buyer, downloads the actual stored bytes with that user's authorization, checks type, size and SHA-256, then calls a server-only attestation function. Standard server environment secrets stay in the function environment. Never put a service key in the browser or repository. This endpoint extracts no text and never calls Ollama or another model. Signature checks identify supported file types; they are not a malware scan.

The private `kalling-buyer-proof` bucket is separate from seller documents. Reservation, current authorization and a logged read are required for authenticated downloads. Signing and listing operations are denied. No client can attest an upload, overwrite immutable bytes or write review tables directly. Viewer staff cannot review or fetch proof.

## Recovery and tests

An interrupted upload keeps its reservation. Retry the same file to resume validation without creating another version or duplicate. A pending validator shows an explicit unavailable state and submission stays blocked. Cloud errors never switch the account into a local demo.

The local demo uses the existing marketplace record and IndexedDB bytes. It is a one-browser fictional demo, not secure shared storage. Fixtures in `tests/buyerVerification.test.mjs` and `production/tests/buyerVerification.test.mjs` cover authorization, actual-byte validation, frozen versions, replacement, expiry, withdrawal, revocation, notes separation, read tickets and stable anonymous labels. Real Auth and Storage transport still require a connected hosted test.
