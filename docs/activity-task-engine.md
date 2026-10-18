# Numbered activities and configurable task progress

## Two numeric identifiers

- `activity_number` identifies one activity occurrence (the compact sequence shown in logs, exports and support tools).
- `event_type_id` identifies the activity category in `public.activity_event_types`.

For example, the first, second and third qualifying referrals to one campaign are three rows with different `activity_number` values, the same referral event category, the same campaign, and different `entity_id` values for the referred friends. A completed task is another row with event type 17 (`task_completed`) and the mission ID as its entity.

The integer identity sequence is unique and ordered in normal use, but **not gapless**: database rollbacks and retries may leave gaps. Do not use activity numbers as counts or as a business rule.

## Task configuration

Existing tasks continue using their current processing. For an activity-driven task, set:

- `missions.progress_event_type_id`: the event category that advances progress.
- `missions.progress_mode = 'event_count'`: count recorded occurrences.
- `missions.progress_mode = 'distinct_entities'`: count distinct `entity_id` values, appropriate for “refer 3 different friends.”
- `target_value`: required count.
- `reward_points`: points awarded once when the target is reached.

Example: a task that awards 100 points when three different referred friends join a campaign:

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

## Extensible verification registry

The API dispatcher in `supabase/functions/verify-activity/index.ts` does not contain a growing chain of action-specific branches. It asks the central registry in `supabase/functions/_shared/verification/index.ts` for a verifier.

To add a genuinely new verification method:

1. Create `supabase/functions/_shared/verification/verifiers/<method>.ts`.
2. Implement the shared `ActivityVerifier` contract from `verification/types.ts`.
3. Validate evidence using trusted server/database records. Never trust client-provided completion flags.
4. Register the action in the registry map in `verification/index.ts`.
5. If it awards progress or rewards, write the trusted activity through the atomic database engine after validation, with a stable idempotency key.
6. Add tests for success, invalid evidence, replay/duplicates and authorization. Add a migration only if the data model or transaction logic requires it.

Most new *campaign tasks* should only require mission configuration when they use an existing, fully implemented verifier. A new *verification capability* still requires code and potentially a database migration. Registry registration alone does not enable rewards.

## Trusted write contract

`public.record_trusted_activity_and_progress(...)` is an internal database function. Execution is revoked from `PUBLIC`, `anon`, and `authenticated`. Call it only from trusted server/database functions after validating the underlying action.

The function is designed to:
1. Insert one numbered activity using an idempotency key.
2. Find active missions configured for that event type.
3. Compute progress from trusted app/server-origin activity rows.
4. Lock the user's campaign membership and mission-progress row.
5. Update the points ledger and balance in the same transaction; a database trigger writes the completion activity on the first transition to completed.

Do not grant direct client access to this helper. The activity log is the history, `mission_progress` is the current state, `referrals` stores the referral relationship, and `point_transactions` is the points ledger.

## Current integration boundary

The migration currently wires referral QR landing, signup-completed, and campaign-joined events into the helper. Existing scan and hunt processing is preserved; its established `process_scan` mission flow continues to handle current scan-count/hunt tasks. To move another action type to the generic engine, call the helper from that action's trusted validator and configure the corresponding mission event type. Do not treat browser-submitted activity as trusted evidence.

## Currently registered verifier

- `resolve_qr`: informational QR preview only. It does not record an activity or award points. Reward-bearing scans still use `process_scan`.
