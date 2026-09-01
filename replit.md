# Lab Progress Board

A weekly Kanban photo synthesis dashboard for research lab teachers to track student group progress and follow up on blockers.

## Run & Operate

- Use Replit's **Run** button (`Project` workflow) to start the full app. Replit
  discovers both artifact services and runs them together:
  - `pnpm --filter @workspace/api-server run dev` — API service on Replit's
    assigned port (declared as local port 8080)
  - `pnpm --filter @workspace/lab-progress-board run dev` — web service on
    Replit's assigned port (declared as local port 23288)
- Replit's application router sends `/api/*` to the API service and all other
  paths to the web service. The Vite proxy to port 3001 is only a convenience
  for non-Replit local development.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required Replit database configuration: `DATABASE_URL` — PostgreSQL connection string
- Required Replit Secret for photo synthesis: `OPENAI_API_KEY`. The application
  still loads without it; only a user-triggered synthesis returns a clear
  configuration error.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/lab-progress-board/src/App.tsx` — responsive dashboard, group directory, group detail, snapshot archive, and photo synthesis UI
- `artifacts/lab-progress-board/src/index.css` — shared app theme and visual language
- `lib/api-spec/openapi.yaml` — source of truth for dashboard, groups, history, snapshots, and synthesis contracts
- `artifacts/api-server/src/routes/progress.ts` — seeded progress data, persistence, history aggregation, and OpenAI photo synthesis
- `lib/db/src/schema/lab-progress.ts` — PostgreSQL tables for groups and weekly snapshots

## Architecture decisions

- Board photos are sent to the synthesis endpoint as data URLs for the current MVP; the database stores the extracted weekly summary and group state rather than image bytes.
- The backend owns the latest group state and snapshot history so dashboard views remain useful after reloads and across sessions.
- AI output is constrained to a compact JSON shape and validated before it is written to the database.

## Product

- Overview dashboard with lab-level progress, four-week trend, group pulse, and teacher attention signals.
- Weekly photo upload flow that sends a board image to OpenAI vision for structured progress synthesis.
- Per-group photo upload flow from each group dossier that updates only that group’s progress record.
- Searchable groups directory, group creation, per-group history, and weekly snapshot archive.

## User preferences

No project-specific preferences recorded.

## Gotchas

- Keep `OPENAI_API_KEY` in Replit Secrets. It is read only by the API server and
  must never be added to frontend variables or committed environment files.
- Clerk, Railway, and `APP_ORIGIN` variables are not used by this architecture.
- The app workflow provides `PORT` and `BASE_PATH`; manual Vite production builds need those values set.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
