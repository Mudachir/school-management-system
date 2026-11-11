# School Admission System

A first-come, first-served admission prototype for school administrators and
parents. PostgreSQL transactions protect limited seats under concurrent requests.
Holds expire automatically unless confirmed through the simulated admission-fee
step. No login or payment gateway is required.

**Stack:** ASP.NET Core / .NET 10, EF Core 10, PostgreSQL 18, React 19,
JavaScript, Vite 8, Nginx and Docker Compose.

## Start with Docker

Install and start **Docker Desktop with Linux containers and Docker Compose**
(or Docker Engine with the Compose plugin on Linux). Git is needed to clone the
repository. Running the application requires no local .NET, Node.js or PostgreSQL.
Open a terminal in the repository root:

```sh
docker compose up --build -d
docker compose ps -a
```

The first build downloads images and dependencies. PostgreSQL becomes healthy,
the migration service exits successfully, then the backend and frontend start.
`migrate` showing **Exited (0)** is expected. To wait for all health checks:

```sh
docker compose up -d --wait
```

| Open | Default URL |
| --- | --- |
| Admin Portal | http://localhost:8088/admin |
| Parent Portal | http://localhost:8088/parent |
| Backend health through Nginx | http://localhost:8088/api/health |
| Direct backend health | http://localhost:8080/health |
| Direct assignment API base | http://localhost:8080 |

Admin can create class/shift combinations, search classes, view dashboard totals
and inspect capacity. Parent can select a **17-digit Birth Registration Number**,
browse classes, hold a seat, review and confirm admission, view applications and
cancel. Each shift has independent capacity. A fresh installation has no sample
data; create a class in Admin first. Use synthetic student numbers when trying it.

Ports 8080 and 8088 must be free. Stop a separately running development API before
starting Docker, or override the ports below. PostgreSQL has no published host port.

## Optional environment configuration

Defaults work without an environment file. They include public **local-demo-only**
database credentials. To customize, copy `.env.example` to `.env` at the repository
root, edit it, then run `docker compose up -d` again.
PowerShell: `Copy-Item .env.example .env`; Bash: `cp .env.example .env`.
Never commit `.env` or use the demo credentials on a public deployment.

| Variable | Default / purpose |
| --- | --- |
| `POSTGRES_DB`, `POSTGRES_USER` | Both `school_admission` |
| `POSTGRES_PASSWORD` | Public local demonstration password; see `.env.example` |
| `DATABASE_CONNECTION_STRING` | Optional complete Npgsql connection string for API and migrator |
| `BACKEND_PORT`, `FRONTEND_PORT` | Host ports `8080`, `8088` |
| `API_PROXY_TARGET` | Server-side backend origin, `http://backend:8080` |
| `HOLD_DURATION_SECONDS` | `600`; positive integer |
| `HOLD_EXPIRATION_POLL_SECONDS` | `5`; positive integer, at most `4294967` |

`API_PROXY_TARGET` must be an HTTP(S) origin without a path or trailing slash,
reachable **from the frontend container**. Browser requests always use `/api`;
backend addresses are not compiled into JavaScript. Changing the host backend
port does not change its internal Docker port. With special connection-string
characters in credentials, supply a correctly quoted `DATABASE_CONNECTION_STRING`.
Changing `POSTGRES_*` does not update users/passwords in an initialized volume;
keep its existing credentials or change them deliberately through PostgreSQL.

## Run the tests

For local checks, install **.NET 10 SDK** and **Node.js 22.12+ with npm**.
Run these commands from the repository root.

### Backend, including real PostgreSQL and concurrency tests

The existing database-only Compose file starts separate development/test servers
on loopback ports 5432/5433. Its volumes are independent of the full-stack database.

```sh
docker compose -f backend/compose.db.yml up -d --wait
dotnet restore backend/SchoolAdmission.sln
dotnet build backend/SchoolAdmission.sln --no-restore
```

Set the test connection in the same terminal. **PowerShell:**

```powershell
$env:SCHOOL_ADMISSION_TEST_CONNECTION = 'Host=127.0.0.1;Port=5433;Database=school_admission_m2_tests;Username=school_admission_test;Password=local_m2_test_only;Timeout=5'
```

**Bash alternative:**

```sh
export SCHOOL_ADMISSION_TEST_CONNECTION='Host=127.0.0.1;Port=5433;Database=school_admission_m2_tests;Username=school_admission_test;Password=local_m2_test_only;Timeout=5'
```

Then:

```sh
dotnet test backend/SchoolAdmission.sln --no-build
```

Tests accept only the dedicated `school_admission_m2_tests` database. Use it
exclusively for tests; expiration tests refuse unrelated leftover holds. Tests
preserve unrelated records and clean up their own committed fixtures. Without
the connection variable, PostgreSQL tests are **skipped**, not verified.

### Frontend

```sh
cd frontend
npm ci
npm run lint
npm test
npm run build
cd ..
```

On PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`. The complete
suite includes headless Chrome/Chromium/Edge lifecycle checks. Install a supported
browser or set `PARENT_TEST_CHROME` to its executable; those checks report skips
if none is available. Their API fixtures are isolated from live data.

## Logs, stop and restart

```sh
docker compose logs --tail 100 migrate backend frontend postgres
docker compose logs -f backend
docker compose down
docker compose up -d
```

Ctrl+C stops following logs. Ordinary `down` preserves the named database volume;
do not request volume removal. After source changes, use
`docker compose up --build -d`. To stop the separate development/test servers:

```sh
docker compose -f backend/compose.db.yml down
```

If startup fails, inspect `docker compose ps -a` and migration logs first. The API
will not start after a failed migration. `/health` is process liveness; the backend
container health check also reads `/classes` to verify database/schema access.

## Architecture and files

Nginx serves the React build and forwards `/api/*` to ASP.NET Core after removing
`/api`. ASP.NET Core uses PostgreSQL service DNS, transactions and class-row locks;
its hosted worker persists expiration. A one-shot EF migration bundle runs before
the API starts. It applies only missing migrations; the API never migrates on
startup. Future migrations must be reviewed before use on valuable data.

```text
backend/                 API, EF migrations, xUnit tests, Dockerfile
  compose.db.yml         Separate development/test databases (preserved)
frontend/                React features, shared components, tests, Dockerfile
  nginx.conf.template    Runtime API proxy and SPA deep-link routing
docs/                    Database design, assumptions, AI disclosure
docker-compose.yml       Full-stack deployment and initialization service
.env.example             Optional local configuration example
```

The Compose project is `school-admission-d1`; its default persistent volume is
`school-admission-d1_postgres_data`. It does not reuse the `backend` project's
development/test volumes. There are no production source bind mounts or host-only
application dependencies.

## Verification and known gaps

Final local verification on November 11, 2026: **189 backend tests passed**,
**81 frontend tests passed**, zero failures/skips on the final runs; frontend lint
and production build passed. Docker checks covered all eight APIs through `/api`,
the browser admission flow, automatic expiry, migration-failure blocking, and data
persistence across `down`/`up`. Synthetic verification records remain only in the
local D1 volume; they are not seeded by the application.

**Submission readiness: PASS for the reviewed requirements.** The two UI gaps
identified in the deployment audit are fixed: all five class views refresh every
five seconds after the previous read completes, and My Applications automatically
reconciles due holds with the server. Manual refresh remains available. Background
reads retain visible data and use bounded expiry retries without overlapping reads.
Live Docker checks verified hold, confirmation, cancellation and expiry updates
without reload. The follow-up added 17 browser regression tests; backend code was
unchanged, so its 189-test result is from the preceding deployment verification.

Student selection still uses tab-scoped session storage: after closing the
tab/browser, re-enter the number to recover saved applications. Automatic identity
restoration is not provided; its assignment interpretation is documented below.

See [assignment comparisons and limitations](docs/ASSUMPTIONS.md),
[AI development disclosure](docs/AI_USAGE.md), [database design](docs/DATABASE_DESIGN.md),
and the detailed [backend](backend/README.md) / [frontend](frontend/README.md) guides.
