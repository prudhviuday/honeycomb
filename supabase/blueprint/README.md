# Blueprint analytics upgrade (10 October 2026)

This directory is a **staged migration**, not an automatic production migration.
The running application still uses the October 3 schema. Do not replay or edit
already-applied migrations. Promote the SQL into `supabase/migrations` only after
the core and QR owners deliver their new-schema migrations and the integration
tests pass against the combined schema.

Required core contracts: `profiles(id, role)`, `campaign_members(campaign_id,
profile_id, member_role)`, `campaigns(id, movie_id, name)`, `movies(id, title)`,
`hunts(id, campaign_id)`, `tasks(id, hunt_id)`, `hunt_progress(profile_id, hunt_id,
status, completed_at)`, `enrollments(profile_id, campaign_id, first_venue_id,
joined_at)`, `qr_codes(id, campaign_id, venue_id)`, and `rewards(id, campaign_id)`.
Profile roles and campaign membership must be server-managed. An old profile
table with self-editable roles is not a compatible prerequisite.

The upgrade creates Rakesh's events, campaign/venue linkage, daily statistics and
hype snapshots. It adds the blueprint venue columns without dropping legacy
contact fields. It does not guess venue coordinates from old locations or
automatically convert the old analytics allowlist into producer roles.

Implementation and rollout details are in `docs/blueprint-analytics.md`.
