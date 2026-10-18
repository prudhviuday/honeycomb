# Numbered activities and configurable task progress

## Two numeric identifiers

- `activity_number` identifies one activity occurrence (the compact sequence shown in logs, exports and support tools).
- `event_type_id` identifies the activity category in `public.activity_event_types`.

For example, the first, second and third qualifying referrals to one campaign are three rows with different `activity_number` values, the same referral event category, the same campaign, and different `entity_id` values for the referred friends. A completed task is another row with event type 17 (`task_completed`) and the mission ID as its entity.

The integer identity sequence is unique and ordered in normal use, but **not gapless**: database rollbacks and retries may leave gaps. Do not use activity numbers as counts or as a business rule.

## Task configuration

Existing tasks continue using their current processing. For an activity-driven task, set:

- `missions.progress_event_type_id`: the event category that advances progress.
- `missions.progress_mode = 'event_count'`: count distinct recorded occurrences by their unique event key.
- `missions.progress_mode = 'distinct_entities'`: count distinct `entity_id` values, appropriate for “refer 3 different friends.”
- `target_value`: required count.
- `reward_points`: points awarded once when the target is reached.

Example: a task that awards 100 points when three different referred friends join the campaign:

```sql
insert into public.missions (
  campaign_id, name, description, mission_type, target_value,
  reward_points, is_active, progress_event_type_id, progress_mode
) values (
  '<CAMPAIGN_UUID>'::uuid,
  'Refer 3 friends to this movie',
  'Invite three different friends who join this campaign.',
  'referral_count',
  3,
  100,
  true,
  38,
  'distinct_entities'
);
```

Activity categories currently added by the migration:

| ID | Code | Meaning |
|---:|---|---|
| 17 | `task_completed` | Server-confirmed task completion |
| 30 | `referral_signup_completed` | A referred friend completed signup |
| 37 | `referral_qr_scanned` | A visitor opened a referral QR landing page |
| 38 | `referral_friend_qualified` | A referred friend joined the campaign / satisfied the trusted qualification signal |

Use event type 30 if signup alone qualifies. Use event type 38 for a campaign-join qualification. If a task requires a trailer view or another action, its trusted backend validator must call `record_trusted_activity_and_progress` with event type 38 only after verifying that action; a client-side event by itself must never award points.

## Trusted write contract

`public.record_trusted_activity_and_progress(...)` is an internal `SECURITY DEFINER` function. Execution is revoked from `PUBLIC`, `anon`, and `authenticated`. Call it only from trusted database functions after validating the underlying action.

The function:
1. Inserts one numbered activity using an idempotency key.
2. Finds active missions configured for that event type.
3. Computes progress from trusted app/server-origin activity rows.
4. Locks the user's campaign membership and mission-progress row.
5. Updates the points ledger and balance in the same transaction; a database trigger writes the completion activity on the first transition to completed.

Do not grant direct client access to this helper. The activity log is the history, `mission_progress` is the current state, `referrals` stores the referral relationship, and `point_transactions` is the points ledger.

## Current integration boundary

This migration wires referral QR landing, signup-completed, and campaign-joined events into the helper. Existing scan and hunt processing is preserved; its established `process_scan` mission flow continues to handle current scan-count/hunt tasks. To move any additional action type to the generic engine, call the helper from that action's trusted database validator and configure the corresponding mission event type. Do not treat browser-submitted activity as trusted evidence.
