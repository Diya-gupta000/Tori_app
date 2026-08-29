# Lab Progress Board

A weekly Kanban photo synthesis dashboard for research lab teachers to track student group progress and follow up on blockers.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

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

- The photo synthesis route requires `OPENAI_API_KEY` in the workspace secrets.
- The app workflow provides `PORT` and `BASE_PATH`; manual Vite production builds need those values set.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
