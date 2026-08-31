# Tori: invited-team deployment

This branch prepares deployment; it does not provision or deploy anything. Use one
application service (Express + built React), one PostgreSQL database, and one Clerk
organization. Browser requests remain relative `/api/...`; Vite's proxy is only
for development. Uploaded JPEG/PNG/WebP images are transient, decoded/validated
locally and sent only to OpenAI; no image storage is added. HEIC is not supported.

## Runtime and configuration

Use Node **24.20.0** (`.node-version`, Dockerfile) and pnpm **11.19.0**
(`packageManager`). Install with `pnpm install --frozen-lockfile`.

| Variable | Where | Secret? | Value/purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | Backend | No | `production` when hosted; `development` locally |
| `PORT` | Backend | No | Railway-provided port; locally `3001` |
| `APP_ORIGIN` | Backend | No | Exact HTTPS app origin, no trailing slash/path; local `http://localhost:5173` |
| `DATABASE_URL` | Backend | **Yes** | Target environment's PostgreSQL connection |
| `MIGRATION_DATABASE_URL` | Pre-deploy, optional | **Yes** | Separate DDL-capable connection; otherwise migrations use `DATABASE_URL` |
| `CLERK_SECRET_KEY` | Backend | **Yes** | Clerk backend key for this environment |
| `CLERK_PUBLISHABLE_KEY` | Backend | No | Same Clerk instance as frontend |
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend **build-time** | No | Public key, must match backend; rebuild when changed |
| `CLERK_ORG_ID` | Backend | No | The one allowed organization |
| `OPENAI_API_KEY` | Backend | **Yes** | Dedicated project key with billing limits |
| `BASE_PATH` | Vite | No | `/` for hosted build and local dev |
| `SYNTHESIS_TIMEOUT_MS` | Backend, optional | No | Default 90000, max 180000 |
| `SYNTHESIS_MAX_CONCURRENT` | Backend, optional | No | Default 2, max 8; keep small |
| `SYNTHESIS_USER_LIMIT` | Backend, optional | No | Default 5 claims per rolling 15 minutes |
| `SYNTHESIS_TEAM_LIMIT` | Backend, optional | No | Default 20 claims per rolling 15 minutes |
| `LOG_LEVEL` | Backend, optional | No | Default `info` |

Copy `.env.example` to an ignored local `.env`, fill it privately, and export those
variables in your shell. Neither pnpm nor Vite automatically loads a root `.env`
for every workspace. For example, from the repository root in each terminal:

```sh
set -a
source .env
set +a
```

Never commit actual `.env`, dumps, private keys, or provider credentials. Only
the Clerk **publishable** key belongs in Vite/Docker build arguments. Never create
`VITE_OPENAI_API_KEY`, pass secret build arguments, or print the environment.

## Local development

Use a separate development database. Do not point tests or migration experiments
at the original `tori` dataset. On a **new, empty** development database, run the
migration command below once. Then, with the environment exported:

```sh
pnpm --filter @workspace/api-server dev
```

In another terminal with the same public Clerk configuration:

```sh
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/lab-progress-board dev
```

Vite proxies `/api` to port 3001; `APP_ORIGIN` must stay the frontend origin.
Authentication is required locally too: missing Clerk configuration fails closed,
not an authentication bypass. Development-only first-read seeding still works
on an empty development roster. Production never seeds on startup or GET.

## Clerk setup (manual, before deployment)

1. Use separate Clerk development/staging and production instances. Enable
   [invite-only access](https://clerk.com/docs/guides/secure/restricting-access).
   Invite users at the application level and into the designated Tori organization.
2. Enable Organizations. Disable user-created organizations and automatic domain
   enrollment if not needed. Configure the intended org ID in the backend.
3. Use default `org:member` and `org:admin` roles. The owner should have admin
   capabilities; an explicit `org:owner` role is also accepted. Members can read
   and synthesize. Only admins/owners can create groups and remove syntheses.
4. Configure the app URL and Clerk's hosted Account Portal invitation/sign-in
   redirects for the exact environment origin. Restrict redirect destinations;
   do not send production invitations to localhost. Configure Clerk's required
   production domain settings when deployment is approved.
5. Test invitations, active-organization selection, sign-out, organization removal,
   and member/admin accounts before allowing real board uploads.

The backend verifies Clerk session tokens and their authorized party, organization,
and role; it never trusts client-provided user/role headers. Signed-out business API
requests return JSON 401, wrong-org users get 403, missing server configuration
gets 503. Session membership/role revocation follows Clerk's short-lived token
refresh; revoke active sessions as well for urgent access removal. Clerk SDK
handshake redirects are not forwarded by API routes. Public frontend HTML is only
a shell; protected data is fetched after server-side team verification.

Protected React Query clients are replaced on user/session/org/role change and
cleared/cancelled on unmount/sign-out. Admin controls are hidden for members, but
server authorization is authoritative. Mutations require an exact `Origin`
matching `APP_ORIGIN`, including requests using a bearer token. Production sends
no CORS allow-origin header. API responses are not cached.

## Build and start

From repository root, with the **public** Clerk build variable available:

```sh
BASE_PATH=/ pnpm run build:production
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

The build typechecks the workspace and builds only the Tori frontend/backend.
The production process requires the runtime variables above, binds `0.0.0.0`,
serves frontend assets/SPA routes and `/api` from one origin. Unknown API paths
never fall through to HTML (JSON 404 for authenticated team callers; authentication
errors take precedence for unauthenticated business API requests). Do not use
`vite preview` as a hosted server.

The Dockerfile pins Node and pnpm, builds without DB/OpenAI/Clerk secrets, retains
the migration tooling, and runs as the unprivileged `node` user. With Docker available:

```sh
docker build --build-arg VITE_CLERK_PUBLISHABLE_KEY -t tori:staging .
```

## Migrations and initial data

Railway pre-deploy command, executed from repository root with the target DB URL:

```sh
pnpm --filter @workspace/db migrate
```

`0000_baseline.sql` creates the existing three-table schema, preserving provenance,
foreign keys, and same-week uniqueness. `0001_production_coordination.sql` adds
`lab_synthesis_requests`, its unique active scope/week index, and
`lab_synthesis_audit`. It does not alter canonical rows, existing history, or
snapshot contents. The migration journal records applied versions; repeated runs
are no-ops. Generate future migrations with `pnpm --filter @workspace/db generate`,
review SQL, and test on a disposable database before committing it. Do not use
schema push or destructive reconciliation in production or application startup.

**Existing schema-push databases are not automatically baselined.** Migration 0000
intentionally refuses existing tables. Do not run it against local `tori` or mark
it applied blindly. Any adoption of an existing database requires a backup,
schema/constraint comparison against 0000, and separately reviewed migration-journal
baselining. No such adoption was performed for this branch.

A new hosted database starts empty. Canonical roster/baseline initialization must
be an explicitly approved data operation, preserving the intended IDs and seed
source flags. Admin Add group is available, but must not be used to recreate the
original roster with different IDs. This branch does not copy local data to cloud
or silently seed a production roster.

## Railway settings (configure only after approval)

Use repository root as the service root; select the root Dockerfile. The exact
build step inside it is `BASE_PATH=/ pnpm run build:production`, after frozen install.
Make `VITE_CLERK_PUBLISHABLE_KEY` available as its sole public build argument.
[Railway Dockerfile variables](https://docs.railway.com/builds/dockerfiles) require
an explicit `ARG`; the Dockerfile deliberately declares no secret arguments.

Set the pre-deploy and start commands shown above, readiness path `/api/readyz`,
healthcheck timeout 60 seconds, **one replica in one region**, restart-on-failure
with a bounded retry count, and at least 15 seconds graceful termination time.
Use an always-running service initially. Set `NODE_ENV=production`, exact
`APP_ORIGIN`, organization/keys, and a private-network PostgreSQL connection.
Keep staging and production databases/keys completely separate.

Configuration is documented as dashboard settings rather than introducing a
legacy `railway.toml`: Railway's current [configuration reference](https://docs.railway.com/config-as-code/reference)
marks that format deprecated for new services. No Railway resources or IaC
provisioning are created by this branch.

## Coordination, operations and backups

Imports take a short PostgreSQL lock shared with existing save/undo, record a
durable claim, then release the transaction **before** calling OpenAI. Concurrent
same-scope/week uploads get explicit 409s instead of duplicate provider work.
Completed same-image retries return the saved snapshot; same-week/backdated
rules and all matching/status/stage/progress/undo algorithms remain unchanged.

Claims expire after the configured analysis timeout plus 15 seconds. The rolling
15-minute claim history enforces user/team limits; active leases bound provider
concurrency. Failed/cancelled attempts count; idempotent completed retries don't.
OpenAI retries are disabled, deadlines/disconnect/shutdown abort requests, and
completion rechecks the lease and cancellation inside the save transaction.
Removal cancels that week's outstanding claims and aborts local provider work;
late results cannot recreate the removed synthesis. Intentional later uploads
get new claims. Request/audit rows contain actor IDs/hashes, never image bytes.
Cancellation cannot guarantee OpenAI did not already incur usage.

The existing save/undo engine remains responsible for before/after provenance,
later manual edits, seeded-snapshot protection and canonical identity invariants.
No current UI manually edits synthesis-owned fields; direct/future edits retain
the existing compare-before-restore protections. This is a single-replica design;
revisit local cancellation delivery before scaling replicas.

`/api/healthz` is liveness; `/api/readyz` verifies DB access to all five required
tables. Startup requires configuration, frontend build and ready schema. Database
connections wait at most 5s; statements and idle transactions are bounded. SIGTERM
stops accepting traffic, aborts analyses, drains connections and closes the pool.
Malformed/oversized JSON produces 400/413 JSON; uploads remain 24MB JSON / 16MB
decoded, with a 25-megapixel decode limit. Production logs omit image bodies,
cookies, bearer tokens, SDK error payloads and credentials.

Enable automated PostgreSQL backups/PITR according to the selected plan. Take a
verified backup before data imports or schema changes; periodically restore into
a separate staging DB and compare canonical IDs, counts, snapshots and history.
Synthesis removal is not a backup. Restrict DB credentials and audit-log access.
Keep retained claim/audit rows initially; do not delete active claims or recent
15-minute attempts. Revisit retention as usage grows. Set OpenAI project spending
alerts/limits; app request limits are not a hard billing cap.

## Verification

Use only a dedicated database whose name includes `tori_synthesis_test_`:

```sh
DATABASE_URL=postgresql://localhost/tori_synthesis_test_production_20260830 pnpm --filter @workspace/db migrate
pnpm --filter @workspace/api-server test
DATABASE_URL=postgresql://localhost/tori_synthesis_test_production_20260830 pnpm --filter @workspace/api-server test:integration
pnpm --filter @workspace/lab-progress-board test
pnpm run typecheck
BASE_PATH=/ pnpm run build:production
```

Integration fixtures keep 14 canonical IDs/names/members/colors invariant before
and after synthesis/removal, use rolled-back test transactions except explicit
concurrency/HTTP tests, and undo their saved test snapshots. Provider responses
and verified identities are injected in-process only for tests; no runtime
authentication bypass or test header exists in the default application.

Before deploying, manually verify with real Clerk staging accounts:

- Signed-out `/api/groups` returns JSON 401; wrong-org account gets 403.
- Member can read/upload but cannot add groups or remove syntheses, even via API.
- Admin can remove; seeded snapshots remain protected. Original 14 IDs remain.
- Refresh a nested frontend URL; health is JSON; unknown `/api` never shows HTML.
- Log out/change account during a request; previous board data disappears.
- Upload JPEG/PNG/WebP; reject corrupt/mislabeled/HEIC and oversized files.
- Two tabs upload the same week simultaneously: one provider request, explicit
  conflict, then idempotent retry. Test a different-image same-week conflict.
- Cancel/remove while a request is pending; late results do not restore it.
- Later manual edits and later syntheses survive earlier synthesis removal.
- Test configured limits, timeout, process restart and DB outage recovery.
- Build/run the Linux Docker image and verify Clerk invitations and actual OpenAI
  synthesis on staging. No external sign-in, paid AI call, or cloud deployment is
  exercised by the mocked automated suite.
