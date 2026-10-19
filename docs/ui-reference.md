# UI screen reference: what each screen does and where its code lives

Use this page when you see a button or UI panel and need to find the implementation. Paths are repository-relative.

## Main navigation

The bottom navigation is defined by tabs in src/app/AppShell.tsx. It shows **Home, Hunts, Scan, Map and Profile**. Rewards and Analytics are accessible through in-screen actions, not bottom-nav buttons.

| User-facing surface | Main component | What the UI does | Background work / dependencies |
| --- | --- | --- | --- |
| Sign in / sign up | src/modules/auth/ui/AuthScreen.tsx | Email/password forms, mode toggle, validation message and loading state | Calls src/modules/auth/api/authApi.ts, which delegates to Supabase Auth; records account/sign-in analytics where configured |
| Home | src/modules/home/ui/HomeScreen.tsx | Movie carousel, points pill, explore shortcuts, progress/mission card, nearby challenges, collection, leaderboard, achievements and reward preview | Loads getCampaignDashboard for the selected campaign; uses active campaign/profile context; nearby distances use a one-shot browser geolocation request |
| Hunts | src/modules/hunts/ui/HuntsScreen.tsx | Lists missions, progress and earned XP; routes incomplete scan-driven tasks to Scan | Loads campaign dashboard and summarizes progress with modules/hunts/logic/huntLogic.ts |
| Scan | src/modules/qr/ui/ScannerScreen.tsx | Camera QR reader (ZXing), manual code entry, scan result/errors and reward-point feedback | Normalizes/unwraps the scanned code, calls processScan and refreshes campaign-user balance; camera stream is stopped during cleanup |
| Map | src/modules/maps/ui/MapScreen.tsx | Campaign location pins, search, location detail panel, general/campaign heatmaps, intensity controls and recenter control | Loads locations, interaction sources, user scans and heatmap RPC results for the selected campaign; builds features through modules/maps/logic/mapData.ts |
| Profile | src/modules/profile/ui/ProfileScreen.tsx | Account identity, city, points, profile editor, rewards shortcut, achievements shortcut, referral route and sign out | Reads Auth/Campaign contexts; updates profile via profile API; points/rewards navigation is an AppShell callback |
| Rewards | src/modules/rewards/ui/RewardsScreen.tsx | Current campaign reward catalog, point balance, draw entries, previous claims, claim actions, claim status and claim confirmation | Loads rewards/entries/claims from the reward API; claim is confirmed by the claim_reward PostgreSQL RPC; reward cards shown as examples on Home are not claimable |
| Movie/campaign detail | src/modules/campaigns/ui/MovieDetailScreen.tsx | Movie/campaign overview, separate movie/campaign status labels, selectable multi-poster gallery, trailer player, join state, missions, mapped locations, referral QR/link and share/copy actions | Loads getMoviePageData, movie metadata/poster URLs/trailer from the related movies row, membership, scans/point history/referrals; may ensure membership and referral QR; URL route preserves campaign/referral/QR context |
| Producer analytics | src/modules/analytics/ui/AnalyticsScreen.tsx | Campaign access list, date range, metric selection, location filter, ranking and report map | Current screen uses analytics_members + get_campaign_analytics via analyticsApi; separate blueprint endpoints are not automatically connected |

## Home page sections and clickable actions

Home has more than just the movie carousel. Use the component comments in HomeScreen.tsx to identify each section.

| UI element | Action |
| --- | --- |
| Points pill | Navigate to Rewards |
| Profile avatar | Navigate to Profile |
| Movie carousel card | First click selects the card; activating a real campaign opens its MovieDetail route. Static demo cards are visual examples, not database campaigns. |
| Explore → Hunts | Navigate to Hunts |
| Explore → Rewards | Navigate to Rewards |
| Explore → Ranks / Leaderboard | Open the leaderboard sheet |
| What your points could unlock | Shows illustrative targets for a free movie ticket, T-shirt, movie event pass and meet-the-crew experience; “Rewards” opens the real campaign catalog |
| Nearby challenges / more | Navigate to Map |
| Collection | Shows earned/claimed items where available; empty state directs users to scan |
| Achievements | Displays campaign badges; the Profile shortcut currently navigates back to Home (there is no separate achievements route yet) |
| Start / Continue Hunt | Navigate to Scan for scan-driven mission progress |

## Profile actions

Profile menu click handlers are wired through AppShell. “My Rewards” and the points total open Rewards. “Achievements” currently returns to Home; it does not open an independent badge inventory. “Refer Friends” opens the active campaign's MovieDetail/referral surface when a campaign is selected; otherwise it falls back to Hunts.

## Map behavior (important distinction)

The Map screen currently uses useCampaign().activeCampaign and fetches locations using that single campaign ID. It does **not** yet query all campaigns for a selected movie and combine their locations. Movie-to-map aggregation is a separate feature change. The pins require valid stored latitude/longitude; the MapLibre rendering component converts the built features/heat points into map layers.

## Reusable UI and mapping helpers

| Concern | File |
| --- | --- |
| Root layout / route / tab selection | src/app/AppShell.tsx |
| MapLibre instance, layers, markers and heatmap controls | src/modules/maps/ui/MapLibreMap.tsx |
| Convert location/source/scan rows into map features | src/modules/maps/logic/mapData.ts |
| Campaign and user map marker imagery | src/lib/mapMarkers.ts |
| Map styles/building layer | src/modules/maps/logic/mapStyle.ts |
| Reward illustrative cards | src/modules/rewards/ui/RewardIdeas.tsx |
| Profile edit form | src/modules/profile/ui/ProfileEditModal.tsx |
| Main UI styling | src/index.css and tailwind.config.js |

## How to trace a visible action

For example, to understand a Reward Claim button:

1. Start at src/modules/rewards/ui/RewardsScreen.tsx and find handleClaim.
2. Follow claimReward imported from modules/rewards/api/rewardsApi.ts.
3. Follow its re-export into application/api/legacyApi.ts.
4. Inspect the claim_reward RPC in the relevant Supabase migration / live database.
5. Verify what it writes, what RLS/permission gates apply and what the returned status means before changing the UI.
