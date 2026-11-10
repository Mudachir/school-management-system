# BACKEND_M6_TASK — Automatic Hold Expiration

**Project:** School Admission System (Onnorokom take-home assignment)  
**Branch:** `feature/hold-expiration`  
**Milestone:** M6 — Automatic database expiration without any API request  
**Scope:** ASP.NET Core `BackgroundService`, configuration, PostgreSQL integration tests, and focused documentation updates.

## 1. Context and constraints

M1–M5 are merged into `main`. The app targets .NET 10, EF Core with Npgsql and PostgreSQL 18. All eight required API endpoints exist. The database has `AdmissionClasses` and `AdmissionHolds`; there is no Students table. `StudentId` is the 17-digit birth-registration-number string. Hold statuses are `HELD`, `CONFIRMED`, `EXPIRED`, and `CANCELLED`. `HOLD_DURATION_SECONDS` defaults to 600 seconds. Seat availability excludes elapsed `HELD` rows even before their status changes. The existing M4/M5 mutation lock order is **class row first, then hold row where necessary**, inside PostgreSQL transactions. Existing tests: **162 passed** against real PostgreSQL before M6.

### Required outcome

A `HELD` record with `ExpiresAt <= current UTC time` becomes persistently `EXPIRED` **without requests to any endpoint**. Expiration must never convert `CONFIRMED` or `CANCELLED` records, alter their timestamps, delete history, or allow capacity/duplicate violations. The worker must coexist safely with reservation, confirmation, and cancellation under concurrent traffic. Existing contracts and tests must continue to work.

## 2. Implementation requirements

1. Implement a hosted `BackgroundService` registered in the existing API process through dependency injection, with a new DI scope / `AppDbContext` for each processing cycle (do not capture scoped DbContext in a singleton).
2. A configurable **expiration sweep interval** (e.g. `HOLD_EXPIRATION_POLL_SECONDS` with a reasonable small positive default, such as 5 seconds). Validate configuration on startup. Document the chosen variable and default. Do not change `HOLD_DURATION_SECONDS` meaning.
3. Start automatically with the API. Work even if no HTTP requests arrive. Use `TimeProvider`/UTC time consistently, and make the worker testable without brittle long sleeps.
4. **Keep lock order compatible with M4/M5:** never lock individual hold rows and then their parent class. One safe design: discover a bounded set of candidate class IDs with elapsed HELD rows using a non-locking query; for each class, open a PostgreSQL `READ COMMITTED` transaction, acquire the **class row `FOR UPDATE`** using the existing shared lock helper, then capture a new UTC decision time and update only elapsed `HELD` rows for that class. Commit the transaction. Discovery outside the lock may be stale; the conditional update must recheck status and `ExpiresAt <= decisionTime`. Equivalent designs are allowed if their deadlock safety is demonstrated.
5. Keep processing **bounded** for large datasets: avoid loading all holds, avoid full unbounded per-row tracking, leverage existing `(Status, ExpiresAt)` index, and consider a bounded batch of class IDs per sweep. Avoid indefinite busy loops. Use efficient set-based database updates such as `ExecuteUpdateAsync` when appropriate.
6. Be idempotent (repeated sweeps should cause no additional changes once a row is EXPIRED). Support **multiple worker instances** safely; PostgreSQL transactions and conditional updates must maintain correctness without process-local locks.
7. Never touch `CONFIRMED`, `CANCELLED`, or already `EXPIRED` rows. Never update `ConfirmedAt` or other historical timestamps. Do not delete records. Expired holds free capacity regardless of whether worker has yet persisted status.
8. Respect application shutdown cancellation; use async cancellation-aware waits and database operations. Handle transient cycle errors with useful logging and recovery on subsequent sweeps rather than permanently terminating the API. Do not suppress configuration failures or conceal persistent exceptions. Do not log student IDs or connection strings.
9. Avoid automatic `Database.Migrate()` or schema changes at startup; preserve the established explicit migration workflow. If PostgreSQL is unavailable, the API liveness endpoint should remain available where reasonable and worker should retry after logged errors.
10. Preserve existing APIs, DTOs, hold duration, header validation, row locking, indexes, migrations, and business rules. Do not introduce new public API endpoints.

## 3. Required tests (real PostgreSQL)

Extend the existing xUnit PostgreSQL integration-test setup safely. Ensure the dedicated test database name guard remains. Tests may control service startup via host configuration to prevent the worker from affecting unrelated test fixtures, **but the new worker must be exercised live** against PostgreSQL, not just mocked.

Test at least:

- Expired HELD changes to persisted EXPIRED **without any API call** after worker startup; verify through a fresh independent DbContext/database query.
- A future HELD remains HELD until expiry.
- CONFIRMED and CANCELLED are never modified even if their `ExpiresAt` is in the past; `ConfirmedAt` and history remain intact.
- Exact expiry boundary (`ExpiresAt == decision time` becomes EXPIRED) or a deterministic equivalent with controlled time.
- Multiple classes and multiple expired holds; no deletion; capacity accurately reflects expiration.
- Repeated runs are idempotent, and process restarts do not corrupt history.
- Worker plus concurrent M4 creation / M5 confirmation / M5 cancellation do not deadlock, overbook, or resurrect expired/confirmed/cancelled holds. Use independent PostgreSQL connections and meaningful synchronization where feasible.
- A second worker instance/process is safe, or a convincing real-database contention test demonstrates multi-instance behavior.
- Config invalid/zero/negative interval rejected; cancellation/shutdown handled promptly.
- Worker errors (such as temporarily unavailable DB) are observed and do not silently disable later sweeps, without destructive test setup.

Do not use EF InMemory, SQLite, or a fake clock as a replacement for live database behavior. `TimeProvider` can supplement live PostgreSQL tests. Avoid flaky delay-only assertions; use bounded eventual assertions and fresh reads. Keep cleanup limited to test-owned data and avoid accidentally expiring other tests' rows.

## 4. Verification and acceptance criteria

- `dotnet restore SchoolAdmission.sln`
- `dotnet build SchoolAdmission.sln --no-restore` — 0 errors
- `dotnet test SchoolAdmission.sln` with `SCHOOL_ADMISSION_TEST_CONNECTION` pointing to the dedicated PostgreSQL test DB — **0 failed, 0 skipped**; preserves all 162 M5 tests and passes new M6 tests
- `dotnet ef migrations has-pending-model-changes --project SchoolAdmission.Api --startup-project SchoolAdmission.Api` — no pending changes
- `git diff --check` and separate check for new files as appropriate — clean
- New tests explicitly prove expiration when **no HTTP requests** occur.

If Docker or PostgreSQL are unavailable in the Codex environment, perform build/static checks, clearly mark database tests as **unverified**, and provide local Git Bash commands. Never claim skipped tests passed. Do not commit, push, merge, switch branches, or delete task document.

## 5. Documentation and handoff

Update `backend/README.md` and `docs/DATABASE_DESIGN.md` to explain the sweep interval, background lifecycle, class-first lock discipline, eventual persistence, how to configure and test, and why request-time expiry checks are retained. Do not recreate obsolete M1–M5 planning docs. Leave `docs/BACKEND_M6_TASK.md` unchanged; it is an explicitly permitted untracked temporary task file.

Codex final report must include:

1. Exact branch and changed files.
2. Worker algorithm and lock order; why it is concurrency-safe with M4/M5 and multiple app instances.
3. Poll interval configuration/default and startup validation.
4. PostgreSQL-backed test scenarios and actual numbers passed, failed, skipped.
5. Build/migration consistency, limitations, and git status.
6. Any actual bugs or risk discovered; stop after M6.

## 6. Explicitly out of scope

- Frontend implementation/integration.
- Extra public APIs or changing any of the eight required contracts.
- Payment processing or authentication beyond the prototype's `X-Student-Id` header.
- Redis, Hangfire, Quartz, external schedulers, message queues.
- Replacing PostgreSQL or creating redundant seat counters.
- Editing already-applied migrations absent a demonstrated defect.
- Full-stack Docker Compose and final submission docs (`README.md`, `ASSUMPTIONS.md`, `AI_USAGE.md`) beyond focused M6 documentation.
