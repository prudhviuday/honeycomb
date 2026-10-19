# Development, tests and release process

## 1. Local setup

1. Install Node.js and npm. A recent supported Node.js release (22+ recommended for the current test toolchain) is a sensible baseline.
2. Clone the repository and check out the feature branch you intend to work on.
3. Run **npm ci** to install exactly the lockfile dependencies.
4. Create .env.local in the repository root. It should contain the two browser settings below, obtained from the intended Supabase project:

~~~dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
~~~

The example above is a template, not a real key. Never use a service_role or secret key here. Vite variables are bundled into code visible to the browser.

5. Start development: **npm run dev**.

If the app reports a missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY, check the file name, variable names and selected environment; restart Vite after changing environment values.

## 2. Repository scripts

| Command | What it checks/does | What it does not prove |
| --- | --- | --- |
| npm run dev | Local Vite app with hot reload | Production deployment or live RPC correctness |
| npm test | Node test suite in tests/*.test.mjs | All UI paths or every live Supabase policy |
| npm run typecheck | TypeScript static type check for src | Runtime behavior and database schema compatibility |
| npm run lint | ESLint rules | A complete behavioral test |
| npm run build | Vite production bundle | It does not invoke the separate typecheck script |
| npm run preview | Local server for built bundle | Remote edge function/database deployment |
| npm run deploy | Wrangler deployment action | Safe verification; do not run just to check a build |

Run the non-deployment checks in this order before requesting review:

~~~bash
npm test
npm run typecheck
npm run lint
npm run build
~~~

Report failures honestly. If a test or typecheck already fails on the base branch, separate baseline failures from regressions in the new diff.

## 3. Environment and secrets

- Browser initialization: src/infrastructure/supabase/supabase.ts.
- Browser settings: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
- Edge Function clients and CORS/auth helpers: supabase/functions/_shared/.
- Server-only values belong in Supabase Edge Function secrets / trusted CI settings, never source code or public Vite variables.
- Do not commit local environment files, access tokens, claim codes, customer data or real user exports.
- Keep local/preview/production Supabase project refs explicit. A frontend preview connected to production Supabase can still make real database requests.

## 4. Database/migration workflow

Before changing SQL:

1. Inspect the live table columns, foreign keys, indexes, RLS policies, function signature and migration history.
2. Read the migration that originally established the object and later migrations that modify it.
3. Confirm whether the intended migration is already applied to the target project.
4. Draft and review a forward migration; do not replay an old initial-schema file as a repair script.
5. Test the combined migrations and RPC behavior in a development Supabase project.
6. Verify grants/RLS and run database advisors where available.
7. Only an explicitly approved release workflow should apply migrations to production.

A migration file in Git is source history, not deployment evidence. Existing docs mention known drift between the compatibility API and deployed schema; see docs/data-model.md and docs/known-limitations.md.

## 5. Pull-request and preview workflow

- Describe the user-visible behavior and affected database/API paths in the PR.
- Add or update tests when changing logic and update docs when changing a screen, data contract, route or background operation.
- Inspect every required preview/build status before merging. A green frontend build alone does not verify authenticated browser behavior or database RPCs.
- Keep production deployments and live schema changes separate from normal source commits unless explicitly approved.
- When a branch preview is connected to live data, test read-only paths first and avoid destructive data changes.

## 6. Useful debugging path

| Symptom | First inspect |
| --- | --- |
| Loading spinner never stops | Screen's Promise.all/allSettled path, error handling, Supabase request timeout and loading-state reset |
| Campaign/movie title missing | mapCampaignRow in legacyApi and joined movies relation |
| Points look different between screens | active campaign context, campaign_users balance mapping, point_transactions ledger and refreshCampaignUser |
| QR resolves to a page but gives no points | Distinguish public QR landing from process_scan accepted scan; inspect RPC result/rejection message |
| Reward list empty | selected campaign ID, rewards.is_active, schema name/inventory mapping, read policy and configured reward rows |
| Reward claim fails | claim_reward RPC response, points balance, inventory, duplicate claim state and RLS/execute permissions |
| Map marker missing | locations campaign_id/is_active/coordinates, interaction sources, buildMapFeatures filtering and the chosen campaign |
| Producer report unavailable | analytics_members/get_campaign_analytics for current UI, or blueprint schema/RPC and campaign authorization for opt-in endpoints |
