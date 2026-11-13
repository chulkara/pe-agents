# Listing alerts

A subscription requires explicit consent, a maximum purchase-price budget and selected NJ/NY regions or an explicit all-regions choice. Frequencies are Off (default), Individual alerts, Daily digest and Weekly digest. Legacy `alerts=true` does not subscribe anyone. Amounts are whole US dollars, inclusive at both boundaries; available down-payment funds are never a purchase-price ceiling. No hidden 10% tolerance remains.

The account preview and local queue use `matchListing`. SQL mirrors those rules and has boundary tests. Published, available Live inventory only; no fictional sample enters delivery. First matches and newly matching material terms create candidates. Publication replay and harmless edits create no duplicates. A public text edit invalidates an existing approval and rebuilds its preview. Digests use batches of at most ten, with additional public results linked. Daily and weekly messages become due at the next UTC day/week boundary. A simulation can preview a future digest immediately and is always labeled simulated.

The advisor reviews the exact recipient and public-only text. Preferences, content, listing availability, recipient, account restrictions, confirmed email and reviewer authorization are checked again at claim. An opaque unsubscribe token works without sign-in, stops only that subscription and cancels pending work. No private listing fields, evidence, attachments or tracking pixels enter an alert payload.

## Deployment and operation

Apply `20261113060811_kalling_listing_alerts.sql` after buyer verification. Private preferences, match state and outbox records have RLS and no direct browser grants. Listing changes and preference changes prepare drafts automatically in Supabase. The local advisor uses Prepare alert previews. Only owner/admin/analyst staff can approve or simulate.

The outbox distinguishes awaiting review, approved, sending, provider accepted, failed, uncertain, suppressed and simulated. A 60-second fenced lease prevents two active workers claiming one message. Known failures have exponential backoff and at most three attempts. A lost acknowledgment or expired sending lease becomes uncertain and requires reconciliation; it is not blindly retried. A revoked subscription invalidates its lease. The service-only claim/completion RPCs cannot be called by a browser user.

`production/email-transport.ts` defines server-side unconfigured and fake adapters. **No live transport, sender or dispatcher is enabled.** The app's simulation never marks provider accepted or delivered. Before live sending, configure and review SMTP, sender/contact details, unsubscribe routing and a server-side dispatcher using the fenced RPCs; test real Auth and Storage separately. Sending does not depend on Ollama or the Mac research worker. No paid provider is added.

Tests: `tests/listingAlerts.test.mjs`, `production/tests/listingAlerts.test.mjs`. These use fictional addresses and database fixtures, never real email.
