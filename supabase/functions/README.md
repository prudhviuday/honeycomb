# Honeycomb Supabase Edge Functions

Server-side TypeScript functions live in this repository under `supabase/functions/`.
They are separate from the React frontend and from the HoneyBadgerAdmin repository,
but belong to the same Honeycomb codebase and Supabase project.

## Activity verification architecture

- `_shared/auth.ts`: validates the caller's Supabase access token and creates a
  server-only service-role client.
- `_shared/verification.ts`: shared evidence lookup helpers (not a reward decision).
- `_shared/activity-engine.ts`: typed wrapper around
  `record_trusted_activity_and_progress`, the database's atomic task/progress/points entry point.
- `verify-activity/index.ts`: authenticated verification API. Currently supports
  non-rewarding active-QR resolution only.

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
