# Function-by-function reference

This is a searchable companion to [API and function catalog](api-and-functions.md). It focuses on exported functions and high-impact internal handlers, grouped by the feature that owns them. Use the repository search for individual component-local handlers, which change more frequently than the public API.

## 1. Auth and profile — legacy API

Source: src/application/api/legacyApi.ts, wrapped by modules/auth/api/authApi.ts and modules/profile/api/profileApi.ts.

| Function | Purpose | Side effects / callers |
| --- | --- | --- |
| getSession | Read the current Supabase session | Used by authentication/activity flows |
| getCurrentUser | Ask Supabase Auth for the signed-in user | Read only |
| onAuthStateChange | Subscribe to session/auth events | AuthProvider uses this to keep context current |
| signUp | Create an email/password Auth account; request a profile row | AuthScreen; profile creation is attempted after successful Auth signup |
| signIn | Sign in with email/password | AuthScreen |
| signOut | End the current Auth session | Profile sign-out |
| getProfile | Fetch profile by user ID | AuthProvider and profile UI |
| upsertProfile | Insert/update profile fields | Profile edit modal save handler |

## 2. Campaigns and membership

Source: src/application/api/legacyApi.ts; wrapper: src/modules/campaigns/api/campaignsApi.ts.

| Function | Purpose | Side effects / callers |
| --- | --- | --- |
| mapCampaignRow | Normalize DB campaign + joined movie fields into the app Campaign shape | Internal adapter; maps name/media_url/movies data to title/hero_image_url/movie_title |
| getCampaigns | Load active campaigns, joined with movie title/poster data | CampaignProvider; Home movie list |
| getActiveCampaigns | Compatibility alias for getCampaigns | Legacy callers |
| getCampaign | Load a single campaign and movie metadata by ID | Movie detail and QR-scan completion route |
| getCampaignUser | Load membership/balance for one campaign/user | CampaignProvider, MovieDetail and Rewards |
| joinCampaign | Insert campaign membership for the current user | Called only when membership is absent; DB uniqueness/permissions still matter |
| ensureCampaignUser | Return existing membership or create it when missing | CampaignProvider / campaign join paths |
| getMoviePageData | Load campaign, locations, interaction sources and missions in parallel | MovieDetailScreen; it does not aggregate all campaigns belonging to a movie |

## 3. Locations, map data and geolocation

Sources: modules/maps/api/mapsApi.ts, modules/maps/api/locationApi.ts, modules/shared/api.ts and modules/maps/logic/mapData.ts.

| Function | Purpose | Side effects / callers |
| --- | --- | --- |
| getLocations | Select active locations for one campaign | MapScreen and MovieDetail data loader |
| getInteractionSources | Select active activation/QR sources for one campaign | MapScreen, MovieDetail and Home dashboard |
| getUserScans | Fetch the signed-in user's scans for one campaign | MapScreen/Home; determines scanned markers/progress |
| getLocationHeatmap | Call get_location_heatmap for a general or campaign-specific heatmap | MapScreen; returns coordinates and weights |
| recordUserLocation | Call record_user_location with a submitted coordinate and optional accuracy | Location-recording helper; review consent/access/retention before extending |
| getNearbyCampaignLocations | Call get_nearby_campaign_locations around a point (the current helper uses a 5 km radius) | Available query helper; distinct from the MapScreen location list |
| buildMapFeatures | Combine location, interaction-source and scan rows into feature objects | MapScreen and MovieDetail map view |
| buildGeoJSON | Convert map features into a GeoJSON point collection with display properties | MapLibre layer setup |
| buildZoneGeoJSON | Create circular activation-zone GeoJSON around features with sources | Optional map visualization |
| calculateDistance | Calculate distance between two coordinates | Home nearby challenges and MapScreen distances |
| formatDistance | Turn distance in kilometres into display text | Map UI |

Map rendering lives in modules/maps/ui/MapLibreMap.tsx. It maintains MapLibre sources/layers and uses modules/maps/logic/mapStyle.ts and src/lib/mapMarkers.ts. It should render presentation features, not perform business awards.

## 4. QR parsing, validation and URLs

Sources: modules/qr/logic/qrLogic.ts, modules/qr/api/qrApi.ts, modules/qr/api/publicQrApi.ts and application/api/legacyApi.ts.

| Function | Purpose | Side effects / callers |
| --- | --- | --- |
| normalizeScanCode | Trim whitespace around a scan code | Scanner and QR helpers |
| isValidScanCode | Check that a normalized input is not empty | Client-side input guard only |
| extractQrCodeFromScan | Extract the opaque code from a /q/<code> URL, or retain a legacy raw code | ScannerScreen; not authoritative QR validation |
| buildMovieReferralUrl | Construct a campaign/referral URL | Referral/share paths |
| buildPublicQrUrl | Construct the public /q/<code> URL | Movie QR/share UI |
| buildQrImageUrl | Construct a QR-image service URL for provided content | QR display; treat the URL as presentation, not validation |
| getQRCode | Resolve a QR code through the compatibility API | Legacy QR callers |
| processScan | Invoke the transactional process_scan PostgreSQL RPC | Current ScannerScreen path; the database decides accepted/rejected and points |
| resolvePublicQr | Call resolve_public_qr | AppShell's /q/<code> route; lookup/landing only |
| getQrVisitorId | Create/reuse a per-session visitor identifier in sessionStorage | Landing attribution |
| recordQrLandingEvent | Call record_qr_landing_event with code, event type and session visitor ID | Page-view/signup/join attribution; not a reward scan |
| getOrCreateFriendInviteQr | Call create_friend_invite_qr for current user's referral code/campaign | MovieDetail referral share/QR |
| createPromotionQr | Call create_promotion_qr with campaign and purpose/attribution fields | Admin/trusted promotion setup helper; confirm access before use |
| getCampaignQrCodesForAdmin | Select campaign QR code metadata ordered newest-first | Admin-oriented code path; RLS must protect access |

## 5. Missions, points, rewards and collection

Source: src/application/api/legacyApi.ts, exposed by modules/hunts/api/huntsApi.ts and modules/rewards/api/rewardsApi.ts.

| Function | Purpose | Side effects / callers |
| --- | --- | --- |
| getPointTransactions | Load a user's campaign point ledger | Movie detail / activity history |
| getMissions | Load active campaign mission/task definitions | Home, Hunts, MovieDetail, dashboard aggregator |
| getMissionProgress | Load the current user's progress for campaign missions | Home and Hunts; uses mission definitions to scope progress because older types/schema may not align |
| getRewards | Load active reward rows ordered by points threshold | RewardsScreen; maps live name/inventory fields to frontend title/stock |
| getRewardEntries | Load user's campaign lucky-draw entries | RewardsScreen points/draw summary |
| getRewardClaims | Load user's campaign claim history | RewardsScreen/Profile collection |
| calculateEntryTotal | Sum entries while tolerating the old entry_count field name | RewardsScreen |
| claimReward | Call claim_reward with campaign and reward IDs | RewardsScreen; authoritative claim transaction belongs to PostgreSQL |
| canClaimReward | UI-level comparison of available points and required points | Button affordability display only; database still validates the claim |
| getRemainingPoints | Calculate points still needed for a reward | Reward UI logic |
| getBadges | Load campaign badge definitions | Home achievements |
| getUserBadges | Load current user's earned campaign badges | Home collection/achievements |
| getLeaderboard | Load the campaign leaderboard | Home leaderboard sheet |
| getMyLeaderboardPosition | Get the current user's rank | Home summary |
| getReferralCode | Load a user's campaign referral code | MovieDetail |
| createReferralCode | Create a referral code for the user/campaign | MovieDetail when one does not exist |
| getReferrals | Load referrals attributed to current user/campaign | MovieDetail referral section |
| getActivityEvents | Fetch activity history using the compatibility event/type mapping | Movie detail / history |
| getCampaignDashboard | Aggregate campaign, membership, missions/progress, rewards/claims/entries, locations/sources, badges, scans, leaderboard and profile data | Home and Hunts; callers should treat it as an aggregate loader rather than a single table query |

The UI helpers summarize how to display these results. They are not the authority to mutate a points balance or mark a trusted task complete.

## 6. Analytics and activity functions

Source: src/modules/analytics/api/analyticsApi.ts and src/modules/analytics/logic/analyticsLogic.ts.

| Function | Purpose | Side effects / callers |
| --- | --- | --- |
| captureEventLocation | Capture one current position; passive mode only proceeds when browser permission is already granted | Adds optional event metadata; it does not start a watch |
| registerActivity | Normalize a known event name, find its stable event type ID, optionally capture one location, insert into activity_events | Frontend analytics convention; writes origin=client and is not trusted proof |
| logActivity | Backward-compatible wrapper around registerActivity | Older feature callers |
| getAnalyticsCampaignIds | Read analytics_members campaign access list | Current Producer Analytics screen |
| getCampaignAnalytics | Call get_campaign_analytics with campaign and exclusive date range | Current AnalyticsScreen report query |
| reportingRange | Convert India-local from/through date inputs into UTC from/to, with exclusive end boundary | Analytics date controls; max 366 days |
| analyticsHeatmap | Filter missing/invalid/nonpositive metric coordinates and normalize weights | Report/map visualization |
| rankedLocations | Sort report locations descending by selected metric | Analytics ranking/list |
| countEvents / sortEventsByTime | Count by event category / sort newest first | Analytics helpers |
| getBlueprintCampaigns | Invoke producer-films and return the blueprint campaign picker response | Opt-in blueprint module, not current AnalyticsScreen path |
| getBlueprintReport | Invoke producer-overview with campaign/date range | Opt-in blueprint module; has separate schema/authorization contract |

## 7. Home/profile/hunt helper functions

| Function | File | Purpose |
| --- | --- | --- |
| getHomePoints | modules/home/logic/homeLogic.ts | Read current campaign points from a loaded dashboard, defaulting to zero |
| getCompletedMissionCount | modules/home/logic/homeLogic.ts | Count completed mission-progress rows |
| summarizeHunt | modules/hunts/logic/huntLogic.ts | Compute hunt progress/XP summary for HuntsScreen |
| getDisplayName | modules/profile/logic/profileLogic.ts | Normalize/display profile name with fallback |
| normalizeProfileInput | modules/profile/logic/profileLogic.ts | Normalize editable profile fields before saving |
| normalizeEmail / normalizeDisplayName | modules/auth/logic/authLogic.ts | Normalize sign-up/sign-in form input |

## 8. Edge Function request handlers

These are the entry points under supabase/functions/. Each request handler has its full implementation in the named index.ts file.

| Handler | Main internal operation |
| --- | --- |
| process-qr-scan | authenticate request → validate scan_code → call process_scan RPC |
| claim-reward | authenticate request → validate reward_id → call claim_reward RPC |
| complete-task | authenticate → check task/campaign/membership → run registered verifier → call record_verified_task_activity |
| verify-activity | authenticate and bound request size/content type → currently accept resolve_qr only → resolveActiveQr |
| producer-films / producer-overview / producer-map / producer-venues / producer-funnel | producerHandler validates request/user/date/campaign/metric → calls blueprint campaign/report RPC |
| scheduled-compute-stats | statsJobHandler validates server key and campaign UUID → recomputes blueprint rollups/hype snapshots |
| recordTrustedActivity | Shared trusted wrapper → record_trusted_activity_and_progress with stable event key and validated activity details |
| resolveActiveQr | Shared helper → check active public/short code, campaign active, time window and max uses; returns QR metadata only |

## 9. Code changes should update this page

When exporting a new API function, add its caller, responsibility, database boundary and side-effect note here. If changing a return shape or replacing a function, update the relevant UI/flow/data-model docs too.
