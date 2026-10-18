# Honeycomb Supabase Edge Functions

TypeScript server functions are in this repository under `supabase/functions/`.
They are separate from the React frontend and the HoneyBadgerAdmin repository,
but belong to the Honeycomb codebase and connect to the same Supabase project.

- `_shared/auth.ts`: validates the caller's Supabase access token and creates a server-only service-role client.
- `_shared/verification.ts`: shared evidence lookup helpers; a lookup alone does not award rewards.
- `_shared/activity-engine.ts`: typed wrapper for the atomic `record_trusted_activity_and_progress` database entry point.
- `verify-activity/index.ts`: authenticated verification endpoint; currently supports non-rewarding active-QR lookup only.

## Deployment gate

The live database has not yet applied `20261018190000_numbered_activity_task_engine.sql`.
Do not deploy reward-bearing actions until that migration is reviewed and applied,
and the existing `process_scan` flow is migrated to the shared engine without
double-awarding mission progress/points.

Trailer completion, quiz answers, VR attendance, mystery-QR prizes, and qualified
referrals must each have trusted evidence sources before they can advance tasks.
The endpoint deliberately rejects unsupported client claims.

Required secret: `SUPABASE_SERVICE_ROLE_KEY` (server-side only). Supabase supplies
`SUPABASE_URL`. Never put the service-role key in browser code or a `VITE_*` variable.
