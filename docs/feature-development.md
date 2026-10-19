# How to add or change a feature

This is the default implementation pattern for new Honeycomb work. The point is to keep UI, transformations, data access and trusted decision-making in the right places.

## 1. Place code in the owning module

~~~text
src/modules/<feature>/
  ui/       React screens/components and UI state
  api/      Feature-specific data access / wrappers
  logic/    Deterministic mapping, validation and calculation helpers
  types.ts  Feature-specific TypeScript types
~~~

Examples already in the repository: auth, campaigns, home, hunts, maps, profile, qr, rewards and analytics.

Use a cross-feature API only for operations that are genuinely shared. The older application/api/legacyApi.ts remains a compatibility adapter used by several modules; do not create a second implementation of the same database query without a migration plan.

## 2. Trace the data contract before editing

1. Find the UI action and its handler.
2. Follow its imported feature API into legacyApi.ts or modules/shared/api.ts.
3. Identify the table/RPC/Edge Function and read its definition.
4. Inspect the live Supabase schema, foreign keys, RLS and execute grants.
5. Decide which layer owns validation and which layer owns the authoritative write.
6. Add loading, empty, error, success and retry behavior appropriate to the operation.

Keep field mapping at a clear boundary. If the live DB stores campaigns.name while the UI uses campaign.title, map it once in the adapter; avoid spreading ad-hoc alternatives through many components.

## 3. Keep trusted business logic out of React

The browser can display an eligibility hint, but it cannot be the authority for a reward-bearing action.

- Accepted QR scans go through the established process_scan transaction.
- Reward redemption goes through claim_reward.
- Activity-driven task rewards require a trusted feature-specific verifier and the internal record_trusted_activity_and_progress contract.
- complete-task currently returns NOT_IMPLEMENTED; do not call it as though it were complete.
- Client registerActivity records product analytics. A client event by itself is not verification evidence.

For an event that advances a task, use a stable event key so request retries cannot duplicate progress or points. Validate campaign, user, QR/source/location attribution and event type on the trusted path.

## 4. Keep UI navigation explicit

- Add new tab IDs in src/app/AppShell.tsx only when the surface deserves a first-class tab.
- Wire button handlers. A styled button without onClick/behavior is not implemented.
- Use existing Tab callbacks for navigation where possible.
- If the screen depends on activeCampaign, handle the no-campaign state rather than assuming a campaign always exists.
- If you keep a screen mounted when hidden, ensure its effects don't keep running expensive polling/camera work unnecessarily.

## 5. Data and privacy checklist

Before creating a table, column or RPC:

- Is an existing table/relation enough?
- Which role can read, insert, update or execute this operation?
- Should this be owner-scoped, campaign-scoped, admin-scoped, or public?
- Are duplicate requests expected? Define a unique constraint or idempotency key.
- Does this data need retention/deletion rules?
- Are GPS, email/phone, claim codes or other personal data being added? Minimize it and do not leak it into event metadata or producer reports.
- Can a user manipulate the UI request to grant themselves points, rewards, roles or campaign access?
- Does this operation have to be atomic across the ledger, balance and inventory?

Never add the Supabase service-role key to a frontend file or Vite variable. For trusted operations use the established Edge Function or database pattern with narrow grants.

## 6. Tests and documentation to update

- Add/update a deterministic test for logic that can be tested without the browser or network.
- Update API/DB tests for contract changes and ownership/duplicate/invalid-input cases.
- Run npm test, npm run typecheck, npm run lint and npm run build.
- Manually test the user journey in a development environment with an authenticated user, using the relevant campaign.
- Update the UI reference if behavior is visible, flows.md if the background sequence changed, data-model.md if relationships changed, and api-and-functions.md if a function or return contract changed.
- Describe schema changes separately from deploying them. Use a reviewed PR and the approved database release process.

## 7. Pull-request checklist

- [ ] The intended behavior and non-goals are stated.
- [ ] Source of truth and data contract were inspected.
- [ ] User-visible buttons are wired and loading/errors are handled.
- [ ] Authorization and server-side validation cannot be bypassed from DevTools.
- [ ] No service secrets or user data were committed.
- [ ] Tests and docs were updated.
- [ ] Build/test statuses were checked.
- [ ] Any database migration/deployment is explicitly approved and documented.
