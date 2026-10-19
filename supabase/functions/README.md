# Honeycomb Supabase Edge Functions

Server-side TypeScript functions live in this repository under `supabase/functions/`.
They are separate from the React frontend and from the HoneyBadgerAdmin repository,
but belong to the same Honeycomb codebase and Supabase project.

## Activity verification architecture

- `_shared/auth.ts`: validates the caller's Supabase access token and creates a
  server-only service-role client.
- `_shared/verification.ts`: backward-compatible home for shared QR evidence lookup.
- `_shared/verification/index.ts`: central action-to-verifier registry.
- `_shared/verification/types.ts`: shared request, outcome and verifier contracts.
- `_shared/verification/verifiers/`: one focused module per verification method.
- `_shared/activity-engine.ts`: typed wrapper around
  `record_trusted_activity_and_progress`, the database's atomic task/progress/points entry point.
- `verify-activity/index.ts`: authenticated API dispatcher. Currently supports
  non-rewarding active-QR resolution only.

## Adding a new task verification method

1. Decide whether an existing verifier already validates the evidence needed by the task.
   If so, configure a mission in HoneyBadgerAdmin; do not duplicate the verifier.
2. If the evidence type is new, add a focused module under
   `_shared/verification/verifiers/` implementing `ActivityVerifier`.
3. Register the action in `_shared/verification/index.ts`. The registry is the
   only action-routing file; the API entry point does not need another action branch.
4. Verify evidence from trusted database/server state. Do not trust client-submitted
   completion booleans, points, event type IDs, or user IDs.
5. For reward-bearing actions, connect the verified result to a trusted database
   transaction/activity-engine RPC and add idempotency, authorization and tests.
   Add a migration only when schema or database transaction logic must change.
6. Deploy the migration and function in the required order before enabling the task.

A registered verifier is not automatically reward-bearing. The current `resolve_qr`
verifier is deliberately informational and does not award points or advance tasks.
Reward-bearing QR scans still use the existing transactional `process_scan` flow.

## Important deployment dependency

The live database does not yet contain the migration
`20261018190000_numbered_activity_task_engine.sql`. Therefore this function must
not be deployed as the production reward-verification endpoint until that migration
has been reviewed and applied, and the existing `process_scan` flow has been
migrated to use the shared engine without awarding points twice.

Trailer completion, quiz answers, VR attendance, mystery-QR prizes, and qualified
referrals must each have a trusted evidence source before they can advance tasks.
The endpoint intentionally rejects unsupported client claims rather than trusting
a browser-submitted "completed" flag.

Required Edge Function secret: `SUPABASE_SERVICE_ROLE_KEY` (server-side only).
The platform supplies `SUPABASE_URL`. Never put the service-role key in the
frontend, a `VITE_*` variable, or the HoneyBadgerAdmin browser bundle.


## Configurable task verification

- `_shared/verification/task-types.ts`: shared verifier/evidence contract.
- `_shared/verification/task-registry.ts`: catalog read by HoneyBadgerAdmin.
- `_shared/verification/verifiers/`: one file per evidence type.
- `complete-task/index.ts`: loads saved task settings, checks task/campaign/member eligibility, validates evidence, and records scoped progress through the atomic `record_verified_task_activity` RPC.
- `missions.verification_action`, `verification_config`, `ui_component`, and `ui_config`: repeatable admin configuration.

Creating a task with an existing verifier is an admin-only operation. A genuinely new evidence type needs a verifier module, registry entry, a UI component only if a new interaction is needed, tests, and sometimes a migration. Apply migrations in order before enabling this flow.
