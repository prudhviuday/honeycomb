# Rakesh location and intelligence module

Based on prudhviuday/honeycomb feature/organic-orange-heatmap at 7572411.

## Delivered implementation

- Optional location sharing on the map, with a stop control. The watch stops when leaving the map. The latest position is stored privately; stopping does not erase an already saved position.
- Campaign-only venue activity glows. No global/current-user GPS feed. A heatmap failure no longer removes venue markers. Campaign changes discard stale requests.
- Producer analytics under Profile → Producer analytics. Campaign/date filters, six map metrics, location filter and rankings, daily activity, repeat users, stage counts and documented engagement calculation.
- Additive venues and venue-to-location relation, event attribution, indexes, trusted backend event API, database triggers for scan/join/task/claim records, and restricted campaign/location/venue rollup views.
- Per-campaign analytics access. An authenticated user can read their access list but cannot grant themselves access. The database independently checks each report request.

## Apply and verify

Do not run the old initial schema against production as a repair script. The repository migration and deployed API have known column differences. Inspect the live schema first, particularly activity_events, venues, locations, interaction_sources, scans, campaign_users, missions, mission_progress and reward_claims. The new migration expects the existing locations coordinates and campaign_id relations.

Apply `20261007090000_location_intelligence.sql` once through the team's migration workflow after all earlier migrations. Its transaction rolls back on failure. No historic event backfill is performed. Do not invent counts for data that was never recorded.

An administrator must explicitly select each producer and campaign before adding an analytics_members row. This is an access grant, not part of automatic signup. Coordinate with Peri before replacing this narrow allowlist with the shared roles/permissions system.

Frontend environment: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Never put a service-role key in the frontend.

Run `npm test`, `npm run typecheck`, `npm run build`. Tests use an isolated in-memory PostgreSQL engine with synthetic users, including RLS and privilege checks. Node 22.18+ or 24+ is needed for the native TypeScript test imports. A production build alone does not validate the live schema or logged-in browser flows.

## Event contract for other owners

Use the service-role-only `record_campaign_event` RPC from a trusted backend after the domain operation succeeds. Required parameters: p_campaign_id, p_user_id, p_event_type, p_event_key. Optional: p_location_id, p_source_id, p_occurred_at. Use a stable operation identifier as the event key, e.g. hunt-start:<progress-id>; retries reuse the key. Keys are scoped to a campaign. Source and location attribution must belong to that campaign. Do not send arbitrary metadata or device GPS to this interface.

Supported events: QR_SCANNED, CAMPAIGN_JOINED, HUNT_STARTED, HUNT_COMPLETED, TASK_STARTED, TASK_COMPLETED, LOCATION_VISITED, REWARD_UNLOCKED, REWARD_CLAIMED, REWARD_REDEEMED, SHARE_COMPLETED.

Scans, campaign joins, mission completion and reward claim inserts are already captured by triggers. Do not also emit these from backend code or they will be counted twice under different keys. Future hunt/share/redemption workflows should emit their own events. For source attribution, use the interaction_source_id on scans. Events without a source remain visibly unattributed; they are not assigned to a guessed venue.

The database records domain writes; it does not add reward/scan anti-abuse rules. Existing ownership and validation remain with Prudhvi and Peri. The baseline migration permits some client domain writes, so domain counts are not proof of physical attendance. The supplied complete-task endpoint remains a 501 placeholder owned by the task module.

## Metric definitions

Reports use [from, to) timestamps, with date controls in Asia/Kolkata. Unique users are deduplicated across the entire selected period; never sum daily unique counts. Repeat users have activity on at least two distinct reporting dates within the period. Engagement rate is distinct users with TASK_COMPLETED divided by all distinct active users. Empty denominators return zero.

Campaign stages are independent distinct-user counts, not a cohort conversion funnel: completion may occur for a user who joined before the selected range. Campaign joins are not new account registrations. Exposure/impressions are not estimated. Historic browser logs are excluded from producer metrics. Public map glows represent attributed venue interactions over the last 30 days.

Rollup views are service-role only and all-time. The authorized report RPC applies date filters directly to indexed events so distinct-user counts remain correct. A scheduled materialized aggregation is intentionally unnecessary for this initial volume; introduce it only with measured demand and preservation of unique-user semantics.

## Pending external verification

Confirm the live schema, apply the migration, assign explicitly approved producer access, test with the actual campaign account, and deploy the reviewed branch through the configured Cloudflare project. Supabase session expiry and Cloudflare sign-in currently prevent that verification. The app's business flow requires Supabase project environment settings and an authenticated test session for full UI validation.

## Local validation and preview

The isolated PostgreSQL suite verifies event deduplication, campaign attribution, report access, blocked self-enrollment, and client provenance protection. The dashboard also has a separate synthetic-data preview: run node node_modules/vite/bin/vite.js --config tests/preview/vite.config.ts and open http://127.0.0.1:5179/. This preview makes no calls to the live Supabase project and is excluded from the production entry point.
