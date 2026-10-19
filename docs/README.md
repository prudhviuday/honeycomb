# Honeycomb developer docs

This folder is the shared onboarding manual for anyone working on Honeycomb. Start with the overview pages before editing a feature. The diagrams use Mermaid and render directly in GitHub.

## Start with these pages

| Need | Read |
| --- | --- |
| Understand the whole app | [Architecture](architecture.md) |
| Find source folders, Edge Functions, migrations and tests | [Repository map](repository-map.md) |
| Find the component behind a button or screen | [UI screen reference](ui-reference.md) |
| Understand what happens after an action | [User journeys and sequence diagrams](flows.md) |
| Understand which records link a movie, campaign, location, scan or reward | [Database model](data-model.md) |
| Find an API, RPC or Edge Function | [API and function catalog](api-and-functions.md) |
| Find the purpose of an exported function and its side effects | [Function-by-function reference](function-reference.md) |
| Install, run, test and release changes | [Development guide](development.md) |
| Build a feature without bypassing trusted logic | [Feature development guide](feature-development.md) |
| Check known unfinished paths and schema caveats | [Known limitations](known-limitations.md) |

## How to use the docs

1. Find the screen or behavior in the UI reference.
2. Follow its source path to the React component.
3. Follow the imports into the feature API, then into the compatibility API or shared API.
4. Read the corresponding sequence diagram to see which database RPC/table or Edge Function gets called.
5. Check the data model and known limitations before changing schema or trusted business logic.
6. Update documentation and tests alongside the code change.

## Source-of-truth hierarchy

When sources disagree, use this order for **current behavior**:

1. The checked-out source code on the branch being reviewed.
2. The actual connected Supabase schema and policies, inspected read-only.
3. The migration that creates or changes the relevant schema/function, plus the migration history proving whether it was applied.
4. These docs, which explain the source and point to it.

Do not infer that a database migration is deployed merely because its SQL file exists. The repository intentionally contains code paths and analytics blueprints that are not all wired into the current UI.

## Current architecture in one picture

~~~mermaid
flowchart TD
  U[Fan / developer / producer] --> UI[React UI]
  UI --> STATE[Auth and campaign contexts]
  UI --> MOD[Feature modules]
  MOD --> API[Feature APIs]
  API --> COMPAT[Legacy compatibility API]
  API --> SHARED[Shared cross-feature API]
  COMPAT --> SB[Supabase browser client]
  SHARED --> SB
  SB --> DB[(PostgreSQL tables and RPCs)]
  UI --> EF[Supabase Edge Functions]
  EF --> DB
  DB --> TRUST[Database validation, transactions and RLS]
~~~

## Existing specialist notes

The activity engine and analytics/intelligence pages describe specific parts of the system. Some analytics pages describe a staged blueprint or historical branch, not automatically the deployed production contract. Read [Known limitations](known-limitations.md) before connecting these endpoints.
