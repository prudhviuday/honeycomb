# Rakesh: October 10 blueprint transition

## State and scope

The blueprint is a target architecture, not evidence that production has already
been migrated. The shared branch currently runs the legacy schema. This work is
isolated on `codex/blueprint-location-analytics` and leaves the existing dashboard,
fan flows, deployed SQL and other owners' UI untouched.

The staged migration is `supabase/blueprint/location_analytics.sql`. **Do not run
it against the current production schema.** Its core-schema preflight deliberately
fails there. It is tested against synthetic tables with the new core/QR contracts.
It must be promoted into the normal migration sequence after those migrations
exist, then validated together in a development Supabase project.

## Implemented in this increment

- Venue blueprint columns (`type`, `lat`, `lng`, `partner_id`) and campaign/venue
  links. Existing venue contact fields and permissions are preserved. Reports
  project only public venue fields, never contact data or fan coordinates.
- Append-only event access: browser roles cannot read or write raw events;
  service-role callers use `blueprint_log_event`. Event keys deduplicate retries
  and conflicting reuse is rejected. QR, task, reward and venue attribution are
  checked against the campaign. Personal metadata is rejected.
- Shared server `logEvent()` helper using the exact blueprint event vocabulary.
  There is no second logging trigger on the new domain tables, avoiding double
  counting when the owning engines call the helper.
- Campaign-scoped producer and admin report access using `profiles.role` and
  `campaign_members`. Fans, promoters and venue partners cannot use producer
  reports. Venue-partner access needs its own restricted scorecard endpoint.
- Event-based overview, valid physical scan counts, distinct users, enrollment
  totals, tasks, rewards, returning users, campaign stages, daily activity and
  venue map/ranking data. Hunt completion counts come from `hunt_progress`, since
  `HUNT_COMPLETED` is absent from the blueprint's fixed event enum.
- Privacy suppression: numeric metrics describing 1–9 identifiable people are
  `null`, not zero. Zero is a measured empty count. Anonymous-only scan groups are
  suppressed. Map endpoints omit suppressed values and missing coordinates.
- Re-runnable daily rollups with both campaign totals and venue buckets. A
  nullable venue cannot be in a primary key; partial unique indexes instead
  enforce one row per campaign/venue/day. Raw rollups remain service-only.
- Configurable hype targets/weights, bounded 0–100 snapshots, and a protected
  `scheduled-compute-stats` endpoint. No scheduler has been enabled remotely.
- New, opt-in frontend API/types for DT; the old dashboard has not been pointed
  at missing new-schema endpoints.

## Server/UI contract

POST to Supabase `/functions/v1/<name>` using the signed-in user's bearer token.
Every response is `{ data: ... }` or `{ error: { code, message } }`.

| Function | Body | Result |
| --- | --- | --- |
| producer-films | `{}` | Allowed campaign IDs/names with movie IDs/titles for the film picker |
| producer-overview | `campaign_id`, ISO `from`, ISO exclusive `to` | Summary, venues, daily, stages, optional hype |
| producer-map | Same, optional `metric` | Venue coordinates and unsuppressed metric values |
| producer-venues | Same | Venue performance, first-touch hunt completions and conversion |
| producer-funnel | Same | Independent stage counts; `exposure: null`, `sequential_cohort: false` |

Map metrics: scans, unique_users, task_completions, reward_claims, interactions.
Dates use India reporting time, converted to UTC intervals by the frontend.
Reports allow at most 366 days. The database independently authorizes every call;
the Edge Function retains the user's identity and never elevates to service role.
DT can use `src/modules/analytics/api/blueprintApi.ts` after deployment.

### Metric choices requiring team awareness

- Scans count only `QR_SCANNED` with boolean `metadata.is_valid=true` and
  `metadata.source=scan`. Invalid attempts and direct links stay in the raw event
  log but are excluded from report activity. Anonymous valid scans count when
  the reported group has at least 10 identified contributors; they do not become
  invented unique fans.
- Engagement is task-completing **scanners** divided by distinct identified
  scanners within the interval. The intersection keeps unrelated task activity
  from inflating engagement beyond 100%.
- Total users counts distinct enrollments as of the report end; other metrics
  use the selected interval. Returning users have events on at least two India
  calendar dates. Daily unique users must never be summed for range totals.
- A completed hunt has no completion venue in the blueprint. Venue completion
  counts therefore use `enrollments.first_venue_id` (first-touch attribution).
  Conversion is completed hunts / valid scans, not a sequential cohort rate.
  Campaign completion totals can include unattributed enrollments.
- Exposure is unmeasured. It is `null`, not estimated from footfall. Stage counts
  are not labeled as a measured conversion cohort.
- Reports currently calculate exact distinct counts from indexed events;
  nightly tables are ready but are not summed to fabricate range-level distinct
  counts. This favors correctness until production volume justifies optimization.
- Threshold suppression is not differential privacy. Arbitrarily overlapping
  reports can allow inference; before broad producer rollout, review fixed
  reporting windows, query limits and complementary suppression with the team.

## Event integration for Prudhvi and Peri

Use one stable key per domain operation, e.g. `scan:<qr_scan_id>` or
`task-completed:<task_completion_id>`. A retry must use the same key. Do not call
the helper from the browser or log unvalidated requests as successful activity.
QR events require a QR ID and `is_valid` plus `source`; other attribution fields
are optional but must match the campaign. GPS, phone/email, proof URLs and device
identifiers are not allowed in event metadata.

Call the SQL logger inside the domain transaction when possible. If using the
TypeScript helper after a separate domain write, the owner must use a durable
outbox/retry mechanism; two separate network calls are not atomic. Registration
events need the same stable business key even if the signup request is retried.
Anonymous pre-signup events stay anonymous; no guessed identity backfill occurs.

Core prerequisites and profile-role protection are listed in the staged README.
The core owner must prevent users from changing their own role or membership.
Old `analytics_members` rows do not implicitly grant new-schema producer access.

## Nightly job and hype

The scheduler calls `scheduled-compute-stats` with `{campaign_id}` and a
server-held service-role bearer token. Never put that token in frontend build
variables. It recomputes the last 14 completed India reporting days and their
hype snapshots. It is safe to retry after partial job failure. Older backfills
and approved erasure must explicitly recompute affected dates with the SQL RPCs.

The team must configure six positive targets in `hype_config.targets` with keys
S/G/C/R/H/W. Units: S scans per day; G signup/scan ratio; C completed/started hunt
ratio; R repeat-user ratio; H share+referral events per active fan; W fractional
week-over-week growth. Weights default to .25/.15/.20/.15/.15/.10 and must sum to 1.
Every signal is clamped to [0,1] against its target. S uses the snapshot day;
G/C/R/H use the trailing seven days; W compares seven-day active-user cohorts.
No targets or fewer than 10 identified people in either comparison week means no
snapshot. Unknown hype must remain “Not available”, not 0.

## Remaining rollout work

1. Confirm whether the new core/QR schema already exists; if so, compare its
   actual columns, constraints and role policies with these tested contracts.
2. Integrate core/QR migrations, review venue mappings/coordinates, promote this
   migration, and exercise the combined schema in development. Do not replay old
   migrations or automatically map legacy scan statuses to valid physical scans.
3. Owners connect domain events transactionally. Configure approved producer
   roles/memberships, campaign targets, the nightly scheduler and job monitoring.
4. DT switches the dashboard API and renders suppressed/null values correctly.
   Complete the separately scoped audience, task-performance, export, venue
   scorecard and admin venue-management endpoints with the respective owners.
5. Replace the legacy continuous location tracker with explicit, optional
   scan-time consent and nearby search. The new analytics module never consumes
   or stores user-location feeds. Existing tracker behavior is not changed here.
6. Verify the full workflow and each role in development, then release through
   the team's reviewed migration/deployment process. Production is unchanged.

Tests: `npm test` includes an isolated PostgreSQL blueprint fixture and HTTP
handler tests. These do not validate a live Supabase deployment or its existing
role policies. Edge Function hosting, scheduler invocation and UI integration
still require the development environment above.

The current shared frontend at `47e64c8` also has unrelated TypeScript errors:
`WebkitUserDrag` in HomeScreen; unsupported MapLibre setter `duration` options
and an untyped building-layer expression; and `BrowserQRCodeReader.reset()` in
ScannerScreen. These files are unchanged by this upgrade. Resolve those with DT
before requiring a clean repository-wide typecheck for release.
