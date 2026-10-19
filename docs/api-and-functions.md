# API, RPC and Edge Function catalog

This page is a map from the code callers to the data boundary. **Function present** does not necessarily mean **currently called by the UI** or **confirmed deployed**.

## 1. Frontend-to-data entry points

| Concern | Source entry point | Main action | Database/API boundary |
| --- | --- | --- | --- |
| Sign up / sign in | modules/auth/api/authApi.ts → application/api/legacyApi.ts | Supabase email/password auth; profile setup | Supabase Auth plus profiles |
| Load campaigns | application/api/legacyApi.ts | Query active campaigns with joined movie metadata | campaigns + movies |
| Load campaign detail | modules/campaigns/api/campaignsApi.ts | Parallel-load campaign, locations, sources and missions | Table selects through legacyApi |
| Load campaign dashboard | modules/home/api/homeApi.ts and modules/hunts/api/huntsApi.ts | Compose current campaign and user data | Dashboard builder in legacyApi |
| Load map | modules/maps/api/mapsApi.ts | Get locations, sources and user scans for one campaign | locations, interaction_sources, scans |
| Heatmap | modules/maps/api/locationApi.ts → modules/shared/api.ts | Request general or campaign heat points | get_location_heatmap RPC |
| QR read/resolve | modules/qr/api/qrApi.ts / publicQrApi.ts | Decode, resolve links, record landing or create QR links | process_scan / resolve_public_qr / record_qr_landing_event / create_friend_invite_qr / create_promotion_qr |
| Rewards | modules/rewards/api/rewardsApi.ts | Get reward catalog, entries and claims; claim reward | rewards, reward_entries, reward_claims, claim_reward RPC |
| Analytics event write | modules/analytics/api/analyticsApi.ts | registerActivity maps known event names and writes client-origin activity | activity_events, activity_event_types |
| Current producer reports | modules/analytics/api/analyticsApi.ts | Get allowed campaign IDs and report data | analytics_members + get_campaign_analytics RPC |
| Blueprint producer reports | modules/analytics/api/blueprintApi.ts | Invoke opt-in report endpoints | producer-* Edge Functions → blueprint_report RPC |

## 2. PostgreSQL RPCs used or referenced by client modules

| RPC | Caller | Purpose / caution |
| --- | --- | --- |
| process_scan | legacyApi.processScan / ScannerScreen | Transactional QR validation, scan record, points ledger, mission progress and result. Authoritative scan path. |
| claim_reward | legacyApi.claimReward / RewardsScreen | Authoritative reward claim transaction. Do not replace its database checks with frontend-only checks. |
| resolve_public_qr | publicQrApi.resolvePublicQr | Resolve active public QR code and associated campaign/movie/purpose. Landing lookup, not a physical scan award. |
| record_qr_landing_event | publicQrApi.recordQrLandingEvent | Record page_view/signup_started/signup_completed/campaign_joined attribution. |
| create_friend_invite_qr | publicQrApi.getOrCreateFriendInviteQr | Get or create inviter-owned friend-invite QR for a campaign/referral code. |
| create_promotion_qr | publicQrApi.createPromotionQr | Admin-oriented QR creation helper; verify authorization grants and deployment before use outside a trusted Admin session. |
| get_location_heatmap | modules/shared/api.ts | Returns general or campaign-specific heat points; MapScreen can render these independently of marker requests. |
| record_user_location | modules/shared/api.ts | Stores a submitted point through a database function; review consent, retention and policies before changing this path. |
| get_nearby_campaign_locations | modules/maps/api/locationApi.ts | Returns campaign locations within a query radius (currently 5 km); not the main MapScreen pin query. |
| get_campaign_analytics | modules/analytics/api/analyticsApi.ts | Current AnalyticsScreen report RPC; separate from blueprint producer APIs. |
| record_trusted_activity_and_progress | trusted Edge/database functions, not browser feature code | Internal task engine. Migration revokes direct execute from PUBLIC/anon/authenticated. Use only after trusted verification. |

Always inspect the RPC definition in the relevant migration and the live database before changing argument names, return shape, grants or transactional semantics.

## 3. Supabase Edge Functions in the repository

| Function directory | Current source behavior | UI wiring / status |
| --- | --- | --- |
| process-qr-scan | Requires an authenticated user, reads scan_code, calls process_scan with p_code, returns success/result | Current ScannerScreen instead calls processScan through legacyApi with campaign_id plus code. This endpoint is not the current UI path; verify RPC overload/signature before wiring it |
| claim-reward | Requires an authenticated user, reads reward_id and calls claim_reward with p_reward_id | Current RewardsScreen calls claim_reward from legacyApi with p_campaign_id and p_reward_id directly. The Edge endpoint is present but not the current UI path |
| complete-task | Source now authenticates the caller, checks task/campaign/membership state, dispatches a registered verifier and records verified evidence through record_verified_task_activity | **Not deployed in the connected production Supabase project.** It depends on the numbered task-engine migration plus the configurable-verification migration. Do not enable reward-bearing QR task settings until legacy process_scan double-award behavior is reconciled. |
| verify-activity | Strictly validates request size/type and authenticates; currently supports resolve_qr only | QR validation preview only; it explicitly rejects unsupported self-asserted reward-bearing actions |
| producer-films | Wrapper over shared producerHandler("films") | Uses blueprint_campaigns RPC; belongs to the opt-in producer blueprint |
| producer-overview | Wrapper over shared producerHandler("overview") | Uses blueprint_report RPC through the shared producer handler |
| producer-map | Wrapper over shared producerHandler("map") | Filters blueprint report venue points; uses the blueprint schema contract |
| producer-venues | Wrapper over shared producerHandler("venues") | Returns blueprint venue metrics; deployment/schema status must be checked |
| producer-funnel | Wrapper over shared producerHandler("funnel") | Returns independent blueprint funnel stages; exposure is null/unmeasured |
| scheduled-compute-stats | Calls the stats job handler using a server-held key | Depends on blueprint_compute_stats / blueprint_compute_hype and a server-side scheduler secret; do not put the key in the frontend |
| _shared/activity-engine.ts | recordTrustedActivity wrapper calls record_trusted_activity_and_progress | Server-only use after validation, stable event key for idempotency |
| _shared/verification.ts | resolveActiveQr helper validates code, active campaign, QR window and use bounds | Called by verify-activity QR preview; that preview itself does not award a scan |
| _shared/producer.ts | Shared auth/body/date/campaign/metric handler | Blueprint reports check access inside the database; requires the matching staged/deployed schema and RPCs |

## 4. Current vs blueprint analytics

The current AnalyticsScreen calls analyticsApi.ts functions that query analytics_members and get_campaign_analytics. blueprintApi.ts is a separate opt-in client for producer-films/producer-overview. Edge functions under producer-* use blueprint_campaigns and blueprint_report, which are documented in docs/blueprint-analytics.md and use a different response/authorization contract.

Do not silently switch one to the other. Before wiring blueprint reports, verify the migration prerequisites, role checks, RPC availability, privacy/null metric handling, and the exact report shape.

## 5. Activity event-writing contract

- registerActivity is the shared frontend analytics entry point and ignores event names without a registered event ID.
- The method adds source_module, uses origin = client, and may capture a single location only if the browser's geolocation permission is already granted unless the caller explicitly selects another mode.
- Client events are for product analytics; they do not automatically qualify for trusted mission progress or reward eligibility.
- Trusted activity writes use a stable event key and the internal record_trusted_activity_and_progress RPC from a trusted backend/database validator.
- Keep source/venue/campaign attribution consistent. Do not log sensitive user details, raw GPS trails or arbitrary proof claims in metadata.
