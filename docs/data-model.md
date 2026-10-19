# Database model and relationships

This is a conceptual map of the entities referenced by current code and repository migrations. It is not a promise that every listed migration has been applied to production. Check live information_schema, RLS policies and migration history before changing schema.

## 1. Main relationship diagram

~~~mermaid
erDiagram
  CLIENTS ||--o{ MOVIES : commissions
  MOVIES ||--o{ CAMPAIGNS : promoted_by
  CAMPAIGNS ||--o{ CAMPAIGN_USERS : enrolls
  CAMPAIGNS ||--o{ LOCATIONS : contains
  VENUES o|--o{ LOCATIONS : physical_place_for
  CAMPAIGNS ||--o{ INTERACTION_SOURCES : tracks
  LOCATIONS o|--o{ INTERACTION_SOURCES : hosts
  CAMPAIGNS ||--o{ QR_CODES : distributes
  INTERACTION_SOURCES o|--o{ QR_CODES : attributed_to
  VENUES o|--o{ QR_CODES : placed_at
  CAMPAIGNS ||--o{ SCANS : records
  CAMPAIGN_USERS ||--o{ SCANS : performs
  QR_CODES ||--o{ SCANS : scanned_as
  INTERACTION_SOURCES o|--o{ SCANS : source
  LOCATIONS o|--o{ SCANS : location
  CAMPAIGNS ||--o{ MISSIONS : configures
  MISSIONS ||--o{ MISSION_PROGRESS : measures
  CAMPAIGNS ||--o{ REWARDS : offers
  REWARDS ||--o{ REWARD_CLAIMS : claimed_as
  CAMPAIGNS ||--o{ REWARD_CLAIMS : scopes
  CAMPAIGN_USERS ||--o{ POINT_TRANSACTIONS : earns_or_spends
  CAMPAIGNS ||--o{ POINT_TRANSACTIONS : scopes
  CAMPAIGNS ||--o{ ACTIVITY_EVENTS : records
  CAMPAIGNS ||--o{ REFERRALS : tracks
  CAMPAIGNS ||--o{ REFERRAL_CODES : issues
~~~

The Mermaid ER diagram is conceptual. Optional relationships, composite constraints and actual deployed foreign-key names must be checked in the relevant migrations and live database.

## 2. Movie → campaign → map location

The core link is:

~~~mermaid
flowchart TD
  MOVIE[movies.id] -->|campaigns.movie_id| CAMP[campaigns.id]
  CAMP -->|locations.campaign_id| LOCATION[locations.id]
  LOCATION --> COORDS[latitude / longitude]
  LOCATION --> SOURCES[interaction_sources.location_id]
  SOURCES --> QR[qr_codes.interaction_source_id]
  QR --> SCAN[scans QR attribution]
~~~

- A movie is the content record (title, poster/trailer and other movie metadata).
- A campaign is a particular promotion/hunt for that movie. Its movie_id points to movies.id.
- A campaign location is a map point owned by the campaign. Its campaign_id points to campaigns.id and its latitude/longitude define where the pin is displayed.
- A physical venue is a reusable place record. Do not assign a venue to only one movie by concept; a venue can participate in multiple campaigns through locations and QR attribution.
- Interaction sources represent trackable activations/touchpoints and may point to a campaign location.
- QR codes can be associated with a campaign and optionally an interaction source, venue, inviter/referral, or hunt mission depending on schema version.

The current consumer Map screen queries locations for one active campaign. The relationships allow a future movie-level map query by collecting all campaign IDs for a movie, then all locations with those campaign IDs; the current screen does not yet perform that aggregation.

## 3. User and points records

| Entity | Responsibility | Developer notes |
| --- | --- | --- |
| profiles | Display/profile fields related to an Auth user | Supabase Auth is the identity source; do not use editable profile metadata for authorization |
| campaign_users | Membership and current points balance for a user/campaign | Points are campaign-scoped in the current model; Context ensures membership for selected campaign |
| scans | Accepted/rejected scan history, source and location attribution | Scan writes should be performed by the transactional scan path |
| point_transactions | Ledger rows describing earned/spent points | Keep a ledger; do not change points only in a React state variable |
| missions | Campaign-specific task definitions and thresholds | Scan-count missions still use established process_scan logic; event-driven tasks use configured event types/modes |
| mission_progress | User's progress/completion state for a mission | Database keying and actual columns vary from older frontend type assumptions |
| badges / user_badges | Badge definitions and awards | Home displays the campaign's badge inventory and earned state |
| rewards | Available guaranteed or lucky-draw rewards | In live schema observed for the current app, display text is stored in name and quantity in inventory; legacyApi maps it to the older frontend shape |
| reward_entries | Lucky-draw entries earned by a user | Entries are campaign-scoped |
| reward_claims | Claim record, status and code; points-consumption data may be returned by the RPC | The legacy RewardClaim type includes points_used, but do not assume it is a physical column in every deployed schema; inspect the live columns/RPC payload |
| referral_codes / referrals | Invite codes and relationships between inviter and referred user | A QR landing is attribution; qualifying a referral task is a separate rule |

## 4. Activity/event records

activity_events is the central log for product interactions and important domain occurrences. activity_event_types maps a compact event_type_id to a stable category code. Some deployments/schema versions add:

- activity_number: sequential ID for a single occurrence; it is unique/ordered but is not guaranteed gapless.
- event_key: idempotency key for retry-safe trusted operations.
- origin: origin/provenance of the event, used by trusted task processing.
- entity_type/entity_id: related domain record such as a campaign, QR, referral or mission.
- metadata: non-sensitive event attributes; avoid raw GPS trails, personal data or arbitrary client-submitted proof.

Do not count activity_number to infer totals; gaps can be caused by rollbacks/retries. Do not treat a browser-origin event as trusted evidence for a reward.

## 5. Schema compatibility adapter

Older UI interfaces live under src/modules/shared/types and are re-exported through src/types. The live database uses several different column names. src/application/api/legacyApi.ts is the current adapter.

| Database field / shape described in adapter | Frontend compatibility shape |
| --- | --- |
| campaigns.name | campaign.title |
| campaigns.media_url or joined movies.poster_url | campaign.hero_image_url |
| joined movies.title | campaign.movie_title |
| campaign_users.points_balance | campaignUser.points |
| missions.name | mission.title |
| missions.target_value | mission.target_count |
| missions.reward_points | mission.points_reward |
| scans.qr_id | scan.qr_code_id |
| scans.scanned_at | scan.created_at |
| point_transactions.amount | pointTransaction.points |
| point_transactions.description | pointTransaction.reason |
| reward_entries.entry_count | rewardEntry.entries |
| reward_claims.claimed_at | rewardClaim.created_at |
| rewards.name | reward.title |
| rewards.inventory | reward.stock |

This mapping table records current compatibility code and migration comments. Re-check it when modifying a query: some interfaces still contain optional/legacy properties that may not exist in the live schema.

## 6. Security model

- Public read policies exist for selected catalog data such as active campaigns, locations, QR resolution and rewards; verify the specific table's live policies before assuming access.
- User-participation data should be restricted to the owning authenticated user or an authorized server/database function.
- RLS controls row access; an authenticated role alone is not authorization for another user's records.
- Never expose a service-role/secret key in frontend source or VITE_ variables.
- Trusted SECURITY DEFINER RPCs must have narrow execute grants, input validation and explicit auth/ownership checks.
- Producer analytics requires its own campaign authorization path. Fan access or a generic campaign ID must not confer producer access.
