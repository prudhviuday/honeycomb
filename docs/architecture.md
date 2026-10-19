# Architecture

## 1. Runtime composition

The app starts at src/main.tsx. It renders src/app/App.tsx, which wraps the shell with two providers:

- AuthProvider (src/application/state/AuthContext.tsx) restores/subscribes to the Supabase session and exposes user/session/profile.
- CampaignProvider (src/application/state/CampaignContext.tsx) loads active campaigns, tracks the selected campaign, ensures campaign membership for a signed-in user, and exposes the points-bearing campaign-user row.

AppShell (src/app/AppShell.tsx) decides which surface to render: sign-in/up, a movie/campaign detail route, an unavailable-QR screen, or the regular tab shell.

~~~mermaid
flowchart TD
  MAIN[src/main.tsx] --> APP[src/app/App.tsx]
  APP --> AUTH[AuthProvider]
  AUTH --> CAMP[CampaignProvider]
  CAMP --> SHELL[AppShell]
  SHELL --> AUTHUI[AuthScreen]
  SHELL --> TABS[Home / Hunts / Scan / Map / Profile]
  SHELL --> REW[RewardsScreen]
  SHELL --> ANALYTICS[AnalyticsScreen]
  SHELL --> MOVIE[MovieDetailScreen]
  TABS --> HOME[HomeScreen]
  TABS --> HUNTS[HuntsScreen]
  TABS --> SCAN[ScannerScreen]
  TABS --> MAP[MapScreen]
  TABS --> PROFILE[ProfileScreen]
~~~

Rewards is a route/tab state in AppShell, but is intentionally not a persistent bottom-navigation item. Home and Profile provide entry points to it. Analytics is opened from the Producer analytics link inside Profile.

## 2. Layer responsibilities

~~~mermaid
flowchart LR
  subgraph Presentation["Presentation layer"]
    Screens[React screens and UI components]
    Logic[Feature logic and view-model helpers]
  end
  subgraph Client["Client data layer"]
    FeatureAPI[Feature API wrappers]
    Legacy[application/api/legacyApi.ts]
    Shared[modules/shared/api.ts]
    ClientInit[infrastructure/supabase/supabase.ts]
  end
  subgraph Supabase["Supabase boundary"]
    Auth[Supabase Auth]
    Tables[(Postgres tables + RLS)]
    RPC[Postgres RPCs / triggers]
    Edge[Edge Functions]
  end
  Screens --> Logic
  Screens --> FeatureAPI
  FeatureAPI --> Legacy
  FeatureAPI --> Shared
  Legacy --> ClientInit
  Shared --> ClientInit
  ClientInit --> Auth
  ClientInit --> Tables
  ClientInit --> RPC
  Screens -. selected server workflows .-> Edge
  Edge --> RPC
~~~

### Presentation

- Screens own interaction state, loading/error/empty states, and rendering.
- Logic folders hold mostly deterministic transformations such as building map features, calculating point eligibility, formatting data or summarizing hunt progress.
- Keep reusable presentation elements close to their feature unless genuinely shared.

### Feature APIs

Feature APIs are small domain-oriented entry points, for example modules/campaigns/api/campaignsApi.ts, modules/maps/api/mapsApi.ts, modules/qr/api/qrApi.ts and modules/rewards/api/rewardsApi.ts. Some simply re-export functions from the older API. That is deliberate compatibility, not evidence of a second database.

### Compatibility API

src/application/api/legacyApi.ts is currently a central adapter between older frontend types and the current Supabase schema. It maps field names and normalizes rows. Before replacing it, migrate callers and test each affected query; do not silently change a field mapping that other screens rely on.

### Shared API and activity logging

src/modules/shared/api.ts contains cross-feature operations such as profile access and location-heatmap access. src/modules/analytics/api/analyticsApi.ts owns the frontend activity-writing convention (registerActivity). Feature code should not invent a separate activity-events insert path.

### Database and server-side logic

PostgreSQL owns the authoritative data, constraints, RLS and transactional business operations exposed through RPCs. Supabase Edge Functions provide authenticated HTTP entry points for selected operations and producer/report endpoints. Some Edge Functions exist but are not yet the call path used by the current React UI; see [API and function catalog](api-and-functions.md).

## 3. State ownership

| State | Owner | Meaning |
| --- | --- | --- |
| Signed-in user and profile | AuthProvider / useAuth | Identity from Supabase Auth and associated profile record |
| Campaign list and selected campaign | CampaignProvider / useCampaign | The active campaign context used by Home, Map, Hunts, Rewards and Movie Detail |
| Current tab | AppShell | Home, Hunts, Scan, Map, Profile, Rewards or Analytics |
| Movie detail route | AppShell URL-derived state | Campaign id, optional referral code, and optional public QR code |
| Screen query results | Owning screen | Campaign dashboard, map features, reward catalog/claims, analytics report, etc. |

AppShell keeps many visited tab components mounted and hides inactive ones so their screen state is retained. The camera scanner is an exception: it is mounted only when Scan is active, allowing camera cleanup when the user leaves it.

## 4. Route handling

- /?campaign=<campaign UUID> opens the MovieDetail screen when the route is resolved.
- /?campaign=<campaign UUID>&ref=<referral code> preserves a referral code for the campaign page.
- /q/<opaque code> or a QR query parameter is resolved with the resolve_public_qr database RPC.
- /?auth=1 opens the authentication UI rather than the unauthenticated movie landing.
- An invalid public QR displays the QR NOT AVAILABLE state.

The public QR route records a QR landing event after resolution; that event is analytics attribution, not proof that a user physically scanned a real-world item.

## 5. Trusted vs. untrusted operations

~~~mermaid
flowchart TD
  Browser[Browser event or button] --> Request[Input sent to API / RPC]
  Request --> Verify{Trusted validation?}
  Verify -->|No| AnalyticsOnly[Optional client analytics]
  Verify -->|Yes| DBTxn[Database transaction / protected RPC]
  DBTxn --> Ledger[Points, claim, progress or scan ledger]
  DBTxn --> Result[Result returned to UI]
  AnalyticsOnly -. never sufficient proof by itself .-> DBTxn
~~~

Important distinction: registerActivity records client-origin analytics events. It is not a general permission to award points. Reward-bearing scans use the established process_scan transaction; reward claims use claim_reward; generic activity-driven tasks require the trusted activity engine and an owning trusted validator. See [Flows](flows.md) and [Known limitations](known-limitations.md).

## 6. Environment and deployment boundary

The browser Supabase client is configured in src/infrastructure/supabase/supabase.ts and reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. The app has separate server-side Supabase client helpers under supabase/functions/_shared. Never move a service-role key to a Vite variable.

A successful Vite build proves the frontend can bundle; it does not prove that the deployed database has all expected RPCs/policies or that each authenticated browser journey works.
