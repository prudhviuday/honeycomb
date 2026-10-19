# Honeycomb

Honeycomb is a mobile-first movie-promotion and fan-engagement web app. Fans discover movie campaigns, scan campaign QR codes, earn points, complete hunts, view map locations, share referrals, and redeem configured rewards. The repository also contains producer analytics APIs and Supabase database functions.

> **Start here:** [Developer documentation](docs/README.md). It is the main index for architecture diagrams, screen-to-code mapping, user journeys, database relationships, server functions, and developer workflows.

## At a glance

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS.
- **Authentication and data:** Supabase Auth and the Supabase JavaScript client, with PostgreSQL tables/RPCs and Supabase Edge Functions.
- **Maps:** MapLibre GL JS, custom marker/heatmap GeoJSON builders.
- **QR scanning:** ZXing browser camera decoder plus manual code entry.
- **Entry point:** src/main.tsx → src/app/App.tsx → AuthProvider + CampaignProvider → AppShell.
- **Main app screens:** Home, Hunts, Scan, Map, Profile, Rewards, and Producer Analytics. Movie details are a routed campaign view.

## Developer setup

Requirements: a supported Node.js release (Node 22+ is a sensible baseline for the test toolchain) and npm.

1. Install dependencies: **npm ci**
2. Create a local environment file such as **.env.local** with the required Supabase URL and **publishable** key (see [development guide](docs/development.md)).
3. Start Vite: **npm run dev**
4. Open the local URL printed by Vite.

Useful scripts:

| Command | Purpose |
| --- | --- |
| **npm run dev** | Start local Vite development server |
| **npm test** | Run the repository's Node test files in tests/ |
| **npm run typecheck** | Run TypeScript without emitting output |
| **npm run lint** | Run ESLint |
| **npm run build** | Build the frontend with Vite |
| **npm run preview** | Serve a local production build |
| **npm run deploy** | Deploy using Wrangler; this is a deployment command, not a build check |

Read [Development, testing and release](docs/development.md) before touching database migrations or deployment configuration.

## Important safety notes

- Never place a Supabase service-role/secret key in Vite environment variables or browser code. Only the publishable/legacy anon key belongs in the frontend.
- The frontend contains a compatibility layer for differences between the deployed database schema and older UI types. Do not rename columns or run migrations merely to satisfy TypeScript; inspect both the live schema and migration history first.
- A SQL file in this repository is not proof that the migration has been applied to the connected Supabase project.
- User-visible success is not trusted proof of a QR scan, task, referral qualification or reward redemption. Reward-bearing decisions must remain on the trusted database/server path.
- The existing Map screen loads locations for the **selected campaign**. Do not assume it currently combines the locations for every campaign belonging to a movie.
- Some analytics and Edge Function code is an opt-in/staged blueprint. See [Known limitations and implementation status](docs/known-limitations.md).

## Documentation map

- [Repository map](docs/repository-map.md)

- [Documentation index](docs/README.md)
- [Architecture](docs/architecture.md)
- [UI screen reference](docs/ui-reference.md)
- [User journeys and sequence diagrams](docs/flows.md)
- [Database model and relationships](docs/data-model.md)
- [APIs, RPCs and Edge Functions](docs/api-and-functions.md)
- [Development, tests and release process](docs/development.md)
- [How to add or change a feature](docs/feature-development.md)
- [Known limitations and implementation status](docs/known-limitations.md)
- [Numbered activity/task engine](docs/activity-task-engine.md)
- [Scoped analytics blueprint](docs/blueprint-analytics.md)
- [Location and intelligence notes](docs/rakesh-intelligence.md)

## Documentation rule

When behavior changes, update the relevant screen, journey, data-model or API page in the same pull request. Document what the code does today separately from the intended future design.
