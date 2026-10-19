# Known limitations and implementation status

This page prevents developers from confusing a working UI, a source file, a staged blueprint or a database migration with a fully wired production flow. Status can change; verify the code and live target before release.

## Current behavior and caveats

| Area | What the current code does | Do not assume |
| --- | --- | --- |
| Movie locations on Map | MapScreen queries locations for the selected active campaign | It does not aggregate locations across all campaigns for one selected movie yet |
| Home movie carousel | Contains local demonstration movie cards plus active database campaigns | Demo cards are not database campaigns and cannot be opened as live campaign records |
| Home reward ideas | RewardIdeas presents a static example of a ticket, T-shirt, event pass and meet-the-crew experience | These cards are not rows in rewards, do not reserve prizes and cannot be claimed |
| Campaign reward catalog | RewardsScreen loads configured reward rows for the active campaign; adapter maps database name/inventory to frontend title/stock | A campaign without reward rows has no real rewards to redeem, even though Home shows examples |
| QR scan | ScannerScreen uses processScan through legacyApi, which calls the transactional process_scan RPC with campaign ID and code | A QR landing page or resolve result alone is not a valid scan or a reason to award points |
| process-qr-scan Edge Function | Code exists and calls process_scan using its own request contract | It is not the current ScannerScreen call path. Check its argument signature before switching the UI |
| claim-reward Edge Function | Code exists and calls claim_reward using reward_id | The current RewardsScreen uses claimReward in legacyApi, which calls the RPC with campaign ID + reward ID |
| complete-task Edge Function | Repository source now implements a verifier registry and trusted record_verified_task_activity call | It is not deployed to the connected production Supabase project. Required task-engine migrations are absent from live migration history; the old process_scan path can also advance scan-count missions, so QR-verification tasks must remain unconfigured until double-award handling is reconciled. |
| Generic activity/task engine | Internal trusted database helper supports event_count and distinct_entities progress modes; referral integrations are configured in migrations | Do not assume every client analytics event is wired to progress. The engine must be called by a trusted validator |
| Current producer analytics UI | AnalyticsScreen uses analytics_members and get_campaign_analytics | Do not assume it uses the producer-* Edge Functions |
| Blueprint producer APIs | blueprintApi.ts plus producer-* Edge Functions use blueprint_campaigns / blueprint_report | Source presence does not prove the staged schema/RPCs are installed, the functions are deployed or the scheduler is configured |
| Scheduled analytics stats | Stats handler requires a server-held key and blueprint stats RPCs | Do not call it from the browser or assume a scheduled trigger exists |
| Achievements in Profile | Profile's Achievements action currently navigates to Home | There is no separate full achievements screen/route today |
| Schema names | legacyApi maps a number of database columns to older UI types | The TS interfaces are not a substitute for live schema introspection |

## Two analytics generations exist

### Current app path

- UI: src/modules/analytics/ui/AnalyticsScreen.tsx
- API: src/modules/analytics/api/analyticsApi.ts
- Access list: analytics_members
- Report contract: get_campaign_analytics
- Date handling: Asia/Kolkata reporting range, end-exclusive timestamp

### Blueprint/staged path

- Client API: src/modules/analytics/api/blueprintApi.ts
- Edge Functions: producer-films, producer-overview, producer-map, producer-venues and producer-funnel
- Shared handler: supabase/functions/_shared/producer.ts
- Database contracts: blueprint_campaigns, blueprint_report and the related blueprint migrations/SQL
- Documentation: docs/blueprint-analytics.md and supabase/blueprint/README.md

Keep these paths separate until an explicit migration plan, schema rollout, authorization review, UI migration and test plan are approved. Blueprint docs may describe intended or isolated implementation, not the live project's current behavior.

## Schema drift is a real concern

src/application/api/legacyApi.ts has an explicit comment explaining that the current database schema differs from the original API layer. Examples include campaign name/title mapping, points_balance/points, missions name/target_value/reward_points, scans qr_id/scanned_at and rewards name/inventory. Consult [Data model](data-model.md).

Before database work, inspect live information_schema and RLS/functions in the intended Supabase project, then compare migration history. Do not run the original core schema or an older blueprint migration as a repair script against a populated production project.

## Security / data integrity invariants

- Points are not just a number rendered in Home: scans, mission completions and claims need their ledger/transactional writes.
- Browser events are not trusted task evidence.
- The user must not be able to grant themselves producer analytics access or mutate another user's claims/points.
- Public QR resolution is attribution/lookup; process_scan is the reward-bearing accepted scan path.
- Never expose a service-role secret to a browser.
- Map GPS / user location data needs a documented consent, collection, retention and access purpose; a map visual should not quietly become global location tracking.
- A SQL migration in Git is not deployment evidence.

## When to remove an item from this list

Only remove/update a caveat after the new code has been reviewed, tests cover the behavior, the relevant DB migration/RPC is verified in the target environment, the appropriate UI is wired, and the documentation/PR explains the rollout. Source code alone is insufficient for claims about production deployment.
