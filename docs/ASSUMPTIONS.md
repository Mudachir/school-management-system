# Assignment requirements, decisions and limitations

This compares the official School Admission System assignment with the implemented
application. References are to its five-page PDF, which is kept outside the
repository. Explicit requirements are not relabelled as assumptions. Source links
show the implementation; discrepancies are identified separately.

## Main comparisons

| Subject / classification | Assignment reference | Implementation and evidence | Reason, effect and limitation |
| --- | --- | --- | --- |
| Student identification — **requirement** | UI/API, pp. 2–3: the birth registration number identifies the student; `X-Student-Id` contains 17 digits. | [Header validation](../backend/SchoolAdmission.Api/Validation/StudentIdHeader.cs), [student helpers](../frontend/src/features/parent/helpers/student.js) and a database check enforce a string of 17 ASCII digits, preserving leading zeroes. | Implements the specified format. No registry lookup, checksum or proof of identity is claimed. |
| No login — **requirement**; no student table — **design choice** | UI, p. 2: no login is needed; use the entered number. | [StudentProvider](../frontend/src/features/parent/context/StudentProvider.jsx) supplies identity; [AppDbContext](../backend/SchoolAdmission.Api/Data/AppDbContext.cs) has only classes/holds. No password, account or student-creation API exists. | Avoids adding an unspecified account system. The header can be impersonated; Admin is also unauthenticated. This is a local prototype. |
| Ownership/public lookup — **requirement with security limitation** | API, pp. 3–4: student header for mutations/My Holds; public GET for hold status/expiry. | [Lifecycle controller](../backend/SchoolAdmission.Api/Controllers/HoldLifecycleController.cs) checks ownership for writes and returns 404 on mismatch. Public GET omits StudentId. The UI checks ownership before displaying details. | Preserves the contracts. Knowing a number permits impersonation; knowing a hold UUID permits public status lookup. Frontend checks and UUIDs are not authentication. |
| A shift is a class — **requirement** | UI, p. 2: each shift has a separate class and capacity. | Each [AdmissionClass](../backend/SchoolAdmission.Api/Domain/AdmissionClass.cs) has its own UUID and seats. Names distinguish class/shift. | Required behavior is retained. Level/shift are encoded in the name rather than separate entities. |
| Class/shift dropdowns — **extension/design choice** | UI/API, pp. 2–3: admin supplies a name and seats; no exhaustive dropdown is prescribed. | [className.js](../frontend/src/features/classes/helpers/className.js) offers Play, Nursery, KG, Class 1–10 and Morning/Day; names use `<Class> - <Shift> Shift`. Backend accepts other valid names. | A user-directed naming convention reduces inconsistent entry. UI creation is narrower than the brief; custom API-created names remain browsable. |
| Name/seat validation — **design choice supporting required 4xx errors** | Rules, p. 4: invalid input must return 4xx; exact name limits are unspecified. | [Request validation](../backend/SchoolAdmission.Api/Contracts/Classes/CreateClassRequest.cs) and [controller](../backend/SchoolAdmission.Api/Controllers/ClassesController.cs) trim names, limit them to 150 characters, require positive integer seats and reject case-insensitive duplicates with 409. | Prevents inconsistent duplicate labels. Seats use a positive 32-bit integer, without an arbitrary smaller business cap. |
| Duplicate active applications — **requirement** | Rules, p. 4: at most one active application/confirmed admission per student in the same class. | [Partial unique index](../backend/SchoolAdmission.Api/Data/Configurations/AdmissionHoldConfiguration.cs) covers student/class for HELD or CONFIRMED. [Hold creation](../backend/SchoolAdmission.Api/Controllers/HoldsController.cs) normalizes the student's stale holds before reapplication under a class lock. | Enforced during races. EXPIRED/CANCELLED history is retained and does not prevent a new application. |
| Different classes — **interpretation** | Rules, p. 4: the duplicate restriction is class-scoped; no school-wide admission limit is stated. | Backend checks/indexes include both student and class, so the same student may hold or confirm in different classes. | Preserves the backend rule's stated scope. There is no global one-admission guarantee. |
| UI guard after confirmation — **extension, frontend only** | No cross-class confirmation restriction is specified. | [admissionService](../frontend/src/features/parent/services/admissionService.js) and [eligibility](../frontend/src/features/parent/helpers/admissionEligibility.js) freshly read My Holds before holding/confirming; any confirmed admission blocks another such UI action. | User-directed usability guard adds a restriction beyond the brief. Independent tabs/clients can race; direct API calls bypass it. **Backend does not enforce cross-class exclusivity.** |
| Four statuses/history — **requirement plus persistence choice** | API, pp. 3–4: HELD, CONFIRMED, EXPIRED, CANCELLED; My Holds lists applications. | [HoldStatus](../backend/SchoolAdmission.Api/Domain/HoldStatus.cs), database checks and transition code use those exact values and retain records/timestamps. | Required statuses are unchanged. Retaining history supports recovery instead of deleting earlier applications. |
| Hold duration/expiration — **requirement plus worker design** | Rules, p. 4: `HOLD_DURATION_SECONDS`, default 600; automatic release without an API call. | [Options](../backend/SchoolAdmission.Api/Configuration/HoldOptions.cs) validate duration. [Worker](../backend/SchoolAdmission.Api/Background/HoldExpirationWorker.cs) starts with the API and [sweeps](../backend/SchoolAdmission.Api/Background/HoldExpirationSweep.cs) elapsed HELD rows. Polling defaults to 5 seconds and is configurable. | Duration/default and automatic release are required. UTC, bounded batches, scoped contexts and polling are implementation choices. Persistence may lag due to polling/backlog/locks; availability excludes elapsed holds immediately. |
| Capacity/concurrency — **requirement plus correctness mechanism** | Rules, p. 4: held plus confirmed must never exceed seats under concurrent requests. | [ClassRowLock](../backend/SchoolAdmission.Api/Data/ClassRowLock.cs) and mutations use PostgreSQL READ COMMITTED transactions, class-first row locks and fresh time after lock acquisition. Class reads aggregate effective statuses. | Protects independent API processes without process-local mutexes or drifting cached counters. Same-class writes serialize; different classes lock independently. |
| Confirmation/payment — **requirement** | UI/rules, pp. 2, 4: treat the fee action as successful payment; only the owner's unexpired HELD can newly confirm; retries cannot double count. | [Lifecycle controller](../backend/SchoolAdmission.Api/Controllers/HoldLifecycleController.cs) confirms once and returns the existing CONFIRMED result on repeats. No payment integration exists. | Matches the prototype. No actual fee verification, settlement or refund is claimed. Confirmed admissions never expire with the old hold timestamp. |
| Cancellation — **interpretation** | API, p. 4: DELETE cancels and returns 204; eligible states are unspecified. | Lifecycle code permits owner cancellation of HELD or CONFIRMED, preserves ConfirmedAt/history and returns 204 on repeat cancellation. EXPIRED returns 409. UI asks for confirmation. | Treats cancellation as releasing an occupied seat, including a confirmed one. This policy is not a payment refund workflow. |
| IDs/time/errors — **implementation choices within contract** | API/rules, pp. 2–4: ID format is open; required response fields stay; invalid input returns 4xx. | UUIDv7, UTC/timestamptz, unchanged DTO fields, 400 validation, 404 unknown/ownership mismatch and 409 conflicts are implemented/tested. | Avoids ambiguous local time and distinguishes failures. Extra `/health` is liveness, without changing the eight required endpoints. |
| Recovery — **requirement**; selected-identity storage — **design choice/interpretation** | UI rule 11, p. 4: applications remain accessible after refresh or closing/reopening the browser; it does not explicitly say the number must be remembered. | [StudentProvider](../frontend/src/features/parent/context/StudentProvider.jsx) uses sessionStorage, validates identity, and resets/aborts student-scoped work on changes. Applications persist in PostgreSQL. | Same-tab reload works. After closing/reopening the browser, re-entering the number recovers records, verified live. Selection is not automatically restored; this is a usability limitation and a risk if automatic identity retention is expected. |
| Countdown/refresh — **requirements plus scheduling choices** | UI rules 9–10, p. 4: show expiry/disable confirmation without reload; update class counts every few seconds. | [Class resources](../frontend/src/features/classes/hooks/useClassResource.js) poll five seconds after each completed read across all five class views. [Application history](../frontend/src/features/parent/hooks/useMyApplications.js) coalesces due HELD records into a server read with bounded rechecks. [Reservation countdown](../frontend/src/features/parent/hooks/useHoldCountdown.js) retains its existing behavior. | Resolves both audit discrepancies. Background reads preserve visible data, manual refresh remains, and route/student/class changes cancel stale work. Clock-based scheduling never overrides server status; after five checks per due record, manual refresh remains available. |
| Docker/environment — **requirement plus deployment choices** | Technology/rules, pp. 1, 4: Docker-only startup, root Compose, backend localhost:8080, configurable database/backend URL and persistent data. | [Compose](../docker-compose.yml), both Dockerfiles and [Nginx](../frontend/nginx.conf.template) supply PostgreSQL 18, .NET 10 and React. Browser `/api` stays fixed; server-side `API_PROXY_TARGET` changes the backend origin at startup. Loopback ports are 8080/8088. | Provides the specified deployment without CORS or browser-baked hosts. Credentials are local examples. TLS, public hosting and production secret management are outside this local setup. |
| Migrations/health — **implementation choices** | Docker startup/data retention are specified; migration mechanism is not. | One-shot EF bundle waits for PostgreSQL health; API waits for migration success; Nginx waits for API readiness. A separate named volume uses PostgreSQL 18's parent data directory. | Repeatable forward initialization via EF history; failure blocks startup. Existing dev/test volumes remain separate. Future schema changes need review/backups; no reset, automatic baseline or downgrade occurs. |

## Resolved UI audit findings

The D2–D5 audit correctly identified two mandatory discrepancies. The explicitly
requested follow-up fixed and verified both:

1. **Periodic seats (p. 4, UI rule 10):** the shared hook now refreshes Dashboard,
   Admission Classes, Class Details, Parent Browse and Parent Class Details every
   five seconds after request completion. Manual refresh and background polling
   share one request guard. Visible data survives routine reads and transient errors.
2. **Idle history expiry (p. 4, UI rule 9):** My Applications schedules reads from
   actual server `expiresAt` values. Due records share one request; a record still
   reported HELD receives bounded sequential rechecks after 2/5/10/20 seconds.
   The server's terminal statuses replace HELD and update available actions.

Tests cover clock skew, exhausted retry budgets, cancellation, slow requests and
stale responses after route/student/class changes. Live Docker checks verified
the seat transitions on all five views and idle application expiry without reload.
Both reported mandatory gaps are resolved; readiness is **PASS** for this audit.

**Browser-reopen interpretation (p. 4, UI rule 11):** sessionStorage retains the
selected number on same-tab reload. Reopening the closed browser profile required
re-entry, after which the saved application was recovered. The brief requires
application recovery but does not explicitly prohibit re-entering identity. This
limitation is distinguished from the resolved discrepancies above; automatic
selected-identity restoration is not provided.

## Correctness and verification notes

Availability is `max(0, totalSeats - liveHeld - confirmed)`. Elapsed HELD records do
not consume seats before their EXPIRED status is persisted. All ordinary mutations
share class-first locking; the partial unique index adds duplicate protection but
would not alone prevent overbooking. The lowercase-name expression index is explicit
SQL in the initial migration and must survive future schema work. See
[database design](DATABASE_DESIGN.md).

The optional multi-process goal (bonus, p. 5) uses PostgreSQL locks rather than
process-local synchronization. Existing tests exercise independent connections and
two API hosts; all **189 backend tests** passed against PostgreSQL during deployment
verification. Backend code is unchanged in this UI follow-up. The final frontend
run passed **81 tests**, including 26 headless-browser regressions. Test navigation
now waits for the requested route, and the earlier index-based application click
uses a stable hold-specific link.

Docker verification covered all eight APIs through `/api`, live admin/parent flows,
reservation expiry, worker persistence without follow-up hold requests, repeat
migration, failed-migration startup blocking and identical class/hold fingerprints
across Compose down/up. Expiry checks used 12-second holds and one-second sweeps;
defaults were restored. Separate development/test data fingerprints were unchanged.
The UI follow-up used 20-second synthetic holds/one-second sweeps to verify automatic
seat and application refresh. Normal 600-second holds/five-second sweeps were restored.

The PDF requests assumptions and AI disclosure (submission, p. 5) without explicitly
specifying their directory. They live in `docs/`, as directed for this submission,
and are linked from the root README. There are no root duplicates.
