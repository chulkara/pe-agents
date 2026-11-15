# Buyer financing evidence

Buyers save an evidence draft, upload up to three PDF, PNG or JPEG files (10 MB each), and submit a frozen version. A replacement immediately removes the previous badge. An authorized advisor reviews the exact file IDs, records a buyer-visible explanation separately from a private note and chooses an expiry. The default freshness policy is 90 days, capped by any stated document validity. A house owner or administrator can configure 1 to 365 days. Existing reviews retain their original expiry.

A verified badge means financing evidence was reviewed. It does not guarantee identity, creditworthiness, funding or closing and does not grant per-listing NDA access. Sellers see the current badge and a stable anonymous label only. Legacy Verified account statuses do not count as reviewed evidence.

## Deployment

The hosted project has all earlier migrations and `20261115200805_kalling_buyer_access_guards.sql` applied. Preserve applied migrations. The new guard fixes a nullable authorization result that previously exposed a proof's private path to an unrelated signed-in account; Storage still refused those bytes. The corrected helper returns an explicit false, so both the RPC and Storage deny the account.

Initial brokerage provisioning is administrative. Ordinary application users cannot claim the global brokerage role. Public seller intake and new buyer registration remain closed by default. Administrators can admit up to 50 explicit buyer user IDs to a private pilot while keeping public registration closed. Existing registered buyers retain their account access. The current hosted pilot admits only the two existing fictional buyer identities.

Deploy `production/functions/kalling-verification-file/index.ts` as `kalling-verification-file`. It authenticates the requesting buyer, downloads the actual stored bytes with that user's authorization, checks type, size and SHA-256, then calls a server-only attestation function. Standard server environment secrets stay in the function environment. Never put a service key in the browser or repository. This endpoint extracts no text and never calls Ollama or another model. Signature checks identify supported file types; they are not a malware scan.

Hosted version 2 uses `verify_jwt=false` at the legacy gateway and validates every bearer token through Auth's user endpoint inside the handler before any private operation. The project's public signing keys use ES256, which the legacy gateway setting does not support. An invalid token still receives HTTP 401. The handler checks confirmed email and uses user-authorized reads; only the final matching-byte attestation uses Supabase's injected server credential. No server credential was retrieved. Current official guidance: [JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys) and [new API keys and Edge Functions](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys#step-4-update-edge-functions).

Build a self-contained function bundle with the locked build tool before deployment:

```sh
node --input-type=module - <<'JS'
import {rolldown} from 'rolldown';
const bundle = await rolldown({input: 'production/functions/kalling-verification-file/index.ts', platform: 'neutral'});
await bundle.write({file: '/tmp/kalling-proof-validator/index.js', format: 'esm'});
await bundle.close();
JS
```

Deploy that entry point using the project administrator's function tool; do not copy an administrative key to the Mac worker or browser.

The private `kalling-buyer-proof` bucket is separate from seller documents. Reservation, current authorization and a logged read are required for authenticated downloads. An advisor's authenticated metadata and byte reads require the same logged, two-minute ticket and current reviewer role. The submitting buyer can read its own upload metadata to resume interrupted validation. Signing and listing operations are denied. No client can attest an upload, overwrite immutable bytes or write review tables directly. Viewer staff cannot review or fetch proof. Private reads use fresh URLs and no-store; a previously issued ticket cannot override a role downgrade.

## Recovery and tests

An interrupted upload keeps its reservation. Retry the same file to resume validation without creating another version or duplicate. A pending validator shows an explicit unavailable state and submission stays blocked. Cloud errors never switch the account into a local demo.

The local demo uses the existing marketplace record and IndexedDB bytes. It is a one-browser fictional demo, not secure shared storage. Fixtures in `tests/buyerVerification.test.mjs` and `production/tests/buyerVerification.test.mjs` cover authorization, actual-byte validation, frozen versions, replacement, expiry, withdrawal, revocation, notes separation, read tickets and stable anonymous labels. The 65-check `scripts/hosted-buyer-access.mjs` protocol is tested against PostgreSQL policies and the actual validator handler with simulated Auth and HTTP. Positive hosted transport remains pending Karan's Mac run. See [hosted acceptance](hosted-validation.md#buyer-verification-and-data-room-acceptance) for the current prepared fixture and commands.
