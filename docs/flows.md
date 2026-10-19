# User journeys and background sequence diagrams

These diagrams show the main request paths visible in the current source. They describe the expected call sequence, not a guarantee that every related migration/function is deployed to a particular Supabase project.

## 1. App startup and state restoration

~~~mermaid
sequenceDiagram
  participant B as Browser
  participant M as main.tsx
  participant A as AuthProvider
  participant S as Supabase Auth
  participant C as CampaignProvider
  participant DB as PostgreSQL
  participant SH as AppShell
  B->>M: Load React application
  M->>A: Mount provider tree
  A->>S: Subscribe to onAuthStateChange
  A->>S: Restore persisted getSession()
  S-->>A: Current session/user (or null)
  A->>DB: getProfile(user.id), when signed in
  A-->>C: User context becomes available
  C->>DB: getCampaigns() (active campaigns)
  DB-->>C: Campaign list
  C->>C: Choose initial active campaign when none selected
  C->>DB: ensureCampaignUser(activeCampaign.id, user.id)
  DB-->>C: Membership / points balance
  C-->>SH: Campaign state and loading status
  SH-->>B: Auth screen, route page or selected tab
~~~

The auth provider intentionally subscribes before awaiting session restoration so a slow getSession response cannot overwrite a newer sign-in/sign-out event. Campaign membership is separate from identity: a signed-in user may need a campaign_users row before the scan RPC accepts a scan.

## 2. Camera QR scan → scan validation → points

~~~mermaid
sequenceDiagram
  participant Fan as Fan
  participant UI as ScannerScreen
  participant QR as qrLogic / legacyApi
  participant RPC as process_scan RPC
  participant DB as PostgreSQL
  Fan->>UI: Scan with camera or enter code
  UI->>QR: Extract and normalize raw code
  QR->>RPC: process_scan(campaign_id, code)
  RPC->>DB: Check authenticated user and active campaign
  RPC->>DB: Check campaign membership
  RPC->>DB: Resolve active/in-window QR and enforce use limits
  RPC->>DB: Reject a repeat scan by the same user
  RPC->>DB: Insert accepted scan and points ledger rows
  RPC->>DB: Update QR usage counter
  RPC->>DB: Advance scan/hunt mission progress; apply eligible bonuses
  RPC-->>UI: success, points awarded, source name/type, campaign id
  UI->>UI: Show scan result and refresh campaign balance
~~~

The current ScannerScreen path calls processScan through the compatibility API, which invokes the database process_scan RPC. The Edge Function named process-qr-scan also exists, but it is not the current ScannerScreen call path; its argument shape differs, so check its RPC contract before wiring it in.

Database-side checks and writes are the authority. Do not award points merely because the browser decoded a QR string.

## 3. Public promotion QR / shared movie link

~~~mermaid
sequenceDiagram
  participant Visitor
  participant App as AppShell
  participant QRAPI as publicQrApi.ts
  participant RPC as resolve_public_qr
  participant DB as PostgreSQL
  participant Detail as MovieDetailScreen
  Visitor->>App: Open /q/code or QR query parameter
  App->>QRAPI: resolvePublicQr(code)
  QRAPI->>RPC: Resolve code, purpose and active movie/campaign
  RPC->>DB: Validate active QR, date window, usage limit and campaign/movie
  RPC-->>App: Campaign/movie data or invalid result
  App->>QRAPI: recordQrLandingEvent(code, page_view)
  App->>Detail: Route with campaign id and optional referral code
  Detail->>DB: Load campaign, locations, sources, missions and membership
  Detail-->>Visitor: Movie promotion landing/detail
~~~

A QR landing page is distinct from a reward-bearing scan. Landing events include page_view/signup_started/signup_completed/campaign_joined and are stored in qr_landing_events. These are attribution/engagement signals; a page view is not proof of a physical visit.

## 4. Reward catalog and redemption

~~~mermaid
sequenceDiagram
  participant Fan
  participant UI as RewardsScreen
  participant API as rewardsApi / legacyApi
  participant DB as PostgreSQL
  Fan->>UI: Open Rewards
  UI->>API: Load campaign rewards, entries and claims
  API->>DB: Select campaign rewards and user claim/entry records
  DB-->>UI: Catalog, draw entries and prior claims
  Fan->>UI: Press Claim / Enter Draw
  UI->>API: claimReward(campaign_id, reward_id)
  API->>DB: claim_reward RPC
  DB->>DB: Validate eligibility and commit authoritative claim/ledger changes
  DB-->>UI: Claim code and status
  UI->>API: Refresh campaign-user balance and catalog
  UI-->>Fan: Confirmation and claim status
~~~

The UI's “enough points” check is for convenience. The database claim_reward function must independently enforce point balance, inventory, eligibility, duplicates and atomic ledger/balance updates. Example reward-goal cards on Home are static illustrative ideas and do not call the claim API.

## 5. Events and mission/task progress

~~~mermaid
flowchart TD
  ACTION[Domain action] --> OWNER[Owning feature handler]
  OWNER --> TRUST{Can the action be verified server-side?}
  TRUST -->|No| CLIENT[registerActivity: client-origin analytics]
  CLIENT --> HISTORY[Activity history / analytics where permitted]
  TRUST -->|Yes| VERIFY[Trusted backend or database validator]
  VERIFY --> EVENT[record_trusted_activity_and_progress]
  EVENT --> KEY[Idempotency key prevents duplicate event]
  KEY --> MISSION[Find active missions listening to event type]
  MISSION --> MODE{Progress mode}
  MODE -->|event_count| COUNT[Count qualifying event occurrences]
  MODE -->|distinct_entities| DISTINCT[Count different entity IDs]
  COUNT --> PROGRESS[Lock and update mission progress]
  DISTINCT --> PROGRESS
  PROGRESS --> COMPLETE{Target reached for first time?}
  COMPLETE -->|Yes| LEDGER[Insert mission points ledger and update balance]
  COMPLETE -->|No| END[Return current result]
  LEDGER --> END
~~~

Important distinction: registerActivity inserts client-origin analytics rows. The shared trusted task engine explicitly counts app/server-origin events and must only be called after a feature-specific verifier has validated the action. Reusing a stable event key makes retries idempotent. Read [activity-task-engine.md](activity-task-engine.md) for the database contract and supported referral event types.

## 6. Campaign map load

~~~mermaid
sequenceDiagram
  participant UI as MapScreen
  participant API as mapsApi / locationApi
  participant DB as Supabase/PostgreSQL
  participant Logic as mapData.ts
  participant Map as MapLibreMap
  UI->>API: getLocations(activeCampaign.id)
  UI->>API: getInteractionSources(activeCampaign.id)
  UI->>API: getUserScans(activeCampaign.id, user.id)
  UI->>API: getLocationHeatmap(null)
  UI->>API: getLocationHeatmap(activeCampaign.id)
  API->>DB: Table queries and get_location_heatmap RPC
  DB-->>UI: Locations, sources, scans and heat points
  UI->>Logic: buildMapFeatures(locations, sources, scans)
  Logic-->>UI: Pin feature models
  UI->>Map: features + heatmap point sets + controls
  Map-->>Fan: Campaign pins, scan states and heat layers
~~~

The current screen fetches for one selected campaign at a time. The null campaign ID passed to get_location_heatmap requests the general heatmap; the active campaign ID requests the campaign-specific heatmap. This does not implement movie-level aggregation across multiple campaigns.

## 7. Current Producer Analytics vs blueprint endpoints

~~~mermaid
flowchart TD
  Screen[AnalyticsScreen] --> API[analyticsApi.ts]
  API --> ACCESS[analytics_members query]
  API --> RPC[get_campaign_analytics RPC]
  RPC --> DATA[Current analytics UI result]
  OTHER[blueprintApi.ts - opt-in module] --> EF[producer-* Edge Functions]
  EF --> HANDLER[_shared/producer.ts]
  HANDLER --> BRPC[blueprint_campaigns / blueprint_report RPCs]
  BRPC --> BLUE[Staged blueprint reporting contract]
~~~

Do not wire the two paths together simply because their concepts overlap. Their response shapes, authorization scheme, schema dependencies and rollout status differ. See [Known limitations](known-limitations.md) and [blueprint-analytics.md](blueprint-analytics.md).

## 8. Referrals and campaign QR attribution

A campaign detail page obtains/creates a referral code, then can request a friend-invite QR from create_friend_invite_qr. The resulting public URL uses /q/<code>. When a visitor opens it, the landing RPC attributes the event to that QR; after authenticated signup or campaign join, the database can associate the referred user with the inviter. Whether a referral advances a particular task depends on its configured qualifying event type and trusted task-engine integration, not simply on displaying/copying a link.
