# Repository map

A directory-level orientation for developers. This inventory describes what is in this repository on the branch being reviewed; the actual UI and data behavior is explained in the linked deeper docs.

## Top-level layout

| Path | Responsibility |
| --- | --- |
| src/main.tsx | Browser entry point; mounts React |
| src/app/ | Root provider composition and application navigation / URL routing |
| src/application/state/ | Auth and campaign contexts shared across features |
| src/application/api/legacyApi.ts | Compatibility API for campaign/user/scan/point/task/reward/leaderboard/referral/activity data access and row-shape mapping |
| src/modules/ | Feature-oriented UI, API wrappers, logic and types |
| src/modules/shared/ | Cross-feature API helpers and shared domain types |
| src/shared/, src/types/, src/screens/ | Compatibility re-exports retained while the module structure evolves |
| src/infrastructure/supabase/ | Supabase client export/initialization path |
| src/lib/ | Legacy data, marker, style and Supabase re-exports/helpers |
| src/components/ | Compatibility UI wrappers |
| public/ | Static movie/category/icon assets and hosting headers |
| supabase/migrations/ | Ordered database migration files kept in source control |
| supabase/functions/ | Deno Edge Functions plus shared server helpers |
| supabase/blueprint/ | Staged analytics blueprint SQL and notes |
| tests/ | Logic/API/blueprint tests, fixtures and preview test app |
| worker/ and wrangler.jsonc | Worker entry/configuration for Wrangler-based deployments |
| docs/ | Developer docs and specialist engine/analytics notes |
| .github/workflows/ | GitHub Actions workflow configuration |
| package.json / package-lock.json | Scripts and locked npm dependencies |
| vite.config.ts / tsconfig*.json / tailwind.config.js / postcss.config.js | Build, TypeScript and CSS tooling configuration |

## Feature modules

| Feature | UI | API | Logic / notes |
| --- | --- | --- | --- |
| Auth | modules/auth/ui/AuthScreen.tsx | modules/auth/api/authApi.ts | modules/auth/logic/authLogic.ts; Supabase email/password |
| Home | modules/home/ui/HomeScreen.tsx | modules/home/api/homeApi.ts | modules/home/logic/homeLogic.ts; assembles carousel, dashboard, collection and preview sections |
| Hunts | modules/hunts/ui/HuntsScreen.tsx | modules/hunts/api/huntsApi.ts | modules/hunts/logic/huntLogic.ts; mission progress summary |
| Campaign/movie | modules/campaigns/ui/MovieDetailScreen.tsx | modules/campaigns/api/campaignsApi.ts | campaignLogic.ts and movie/detail/referral state |
| Maps | modules/maps/ui/MapScreen.tsx; MapLibreMap.tsx; LocationTracker.tsx | mapsApi.ts; locationApi.ts | mapData.ts, mapMarkers.ts, mapStyle.ts |
| QR | modules/qr/ui/ScannerScreen.tsx | qrApi.ts; publicQrApi.ts | qrLogic.ts; scan parser and public QR helper methods |
| Profile | modules/profile/ui/ProfileScreen.tsx; ProfileEditModal.tsx | profileApi.ts | profileLogic.ts |
| Rewards | modules/rewards/ui/RewardsScreen.tsx; RewardIdeas.tsx | rewardsApi.ts | rewardLogic.ts; Home reward ideas are illustrative and separate from claimable DB rewards |
| Analytics | modules/analytics/ui/AnalyticsScreen.tsx | analyticsApi.ts; blueprintApi.ts | analyticsLogic.ts; current report path and opt-in blueprint path are separate |
| Shared | — | modules/shared/api.ts | modules/shared/types/index.ts |
| Admin support folder | — | — | modules/admin currently contains logic/types only; the separate admin web app is in the HoneyBadgerAdmin repository |

## Supabase Edge Function directory inventory

| Function path | Purpose |
| --- | --- |
| functions/process-qr-scan | Authenticated HTTP wrapper around scan RPC (not the current ScannerScreen call path) |
| functions/claim-reward | Authenticated HTTP wrapper around claim_reward RPC (not the current RewardsScreen call path) |
| functions/complete-task | Configured-task verifier: checks task/campaign/member state, validates registered evidence and records trusted task progress | Source is not deployed to production; task-engine migrations and scan double-award handling must be resolved before activation |
| functions/verify-activity | Fail-closed activity/QR verifier; resolve_qr is the currently supported action |
| functions/producer-films | Blueprint producer campaign/movie picker |
| functions/producer-overview | Blueprint producer summary |
| functions/producer-map | Blueprint producer map metric points |
| functions/producer-venues | Blueprint venue metrics |
| functions/producer-funnel | Blueprint stage/funnel response |
| functions/scheduled-compute-stats | Protected blueprint rollup/hype job handler |
| functions/_shared/auth.ts | Shared authentication helpers |
| functions/_shared/cors.ts | CORS headers |
| functions/_shared/supabase.ts | User/admin Supabase client creation for trusted functions |
| functions/_shared/verification.ts | Active QR lookup and limits |
| functions/_shared/activity-engine.ts | Server wrapper for trusted activity/task progression |
| functions/_shared/logEvent.ts | Shared event logging helpers for blueprint/backend features |
| functions/_shared/producer.ts | Shared handler for producer Edge Functions |
| functions/_shared/statsJob.ts | Protected stats job request handler |

See [API and functions](api-and-functions.md) for request paths, RPCs and current UI wiring.

## Migration files in this checkout

Migration timestamps are listed here to orient readers, not to claim the migration has been applied to any specific Supabase project.

| Migration file | Broad intent from its name/source |
| --- | --- |
| 20261003152644_create_campaign_schema.sql | Original campaign/profile/scan/mission/reward base schema |
| 20261006034800_add_user_location_heatmaps.sql | Add user-location heatmap support |
| 20261006034900_harden_location_heatmap_rpc.sql | Harden heatmap RPC |
| 20261006035000_extend_location_heatmaps_to_campaign_events.sql | Extend location heatmap support |
| 20261007090000_location_intelligence.sql | Location/venue intelligence |
| 20261009025330_restore_scan_backed_heatmap.sql | Restore scan-backed heatmap behavior |
| 20261009120000_fix_producer_analytics_scan_metrics.sql | Fix scan metric calculation for producer analytics |
| 20261018060352_universal_movie_qr_workflow.sql | Universal public QR route, QR landing events and campaign/movie validation |
| 20261018060400_process_scan_qr_purposes.sql | Process purpose-specific scan behavior |
| 20261018060449_restrict_qr_function_privileges.sql | Restrict QR function execution grants |
| 20261018060602_support_public_code_scans.sql | Support public code scans |
| 20261018060610_backfill_movie_qr_public_codes.sql | Populate/backfill public QR codes |
| 20261018062447_admin_create_friend_invite_qr.sql | Friend invite QR creation function |
| 20261018123839_restrict_admin_friend_invite_qr.sql | Restrict friend invite QR creation permissions |
| 20261018150000_resolve_legacy_qr_short_codes.sql | Resolve legacy short codes |
| 20261018180000_movie_first_scan_bonus.sql | First movie scan bonus within process_scan |
| 20261018190000_numbered_activity_task_engine.sql | Numbered events and configured trusted activity/task progression |

Read the SQL before relying on the broad label; migrations can contain additional columns, policies, functions and triggers. Always verify the target project's migration history and live schema before applying or editing one.

## Test inventory

| Path | Role |
| --- | --- |
| tests/blueprint.test.mjs | Isolated blueprint SQL/behavior tests using a synthetic database fixture |
| tests/intelligence.test.mjs | Location/intelligence behavior tests |
| tests/producer-api.test.mjs | Producer API handler tests |
| tests/preview/ | Minimal preview app/fixtures for UI or browser-related tests |

A test passing against synthetic fixtures does not validate a live Supabase project's actual RLS, RPC grants, secrets or deployed Edge Function versions.

## Fast source tracing examples

- To change a button: screen component → callback/handler → imported feature API → API implementation → RPC/table.
- To change points: trace process_scan or claim_reward and point_transactions/campaign_users, not just the Home score label.
- To change map appearance: MapScreen feature creation → mapData.ts → MapLibreMap.tsx → mapStyle.ts / lib/mapMarkers.ts.
- To change producer reporting: first determine whether you are modifying the existing AnalyticsScreen + get_campaign_analytics path or the separate blueprintApi.ts + producer-* path.
- To change trusted task completion: review activity-task-engine.md, its migration and the trusted validator that emits the event.
