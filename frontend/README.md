# School Admission System Frontend

Admin milestones F1-F5 provide the shared shell, API-connected Dashboard,
searchable Admission Classes page, Class Details, and one shared creation modal.
Milestones F6-F8 add a separate Parent Portal at `/parent`: student selection,
class browsing, seat holds, confirmation, cancellation and application history.

## Setup and local servers

Use Node.js 22.12+ and npm. From the repository root:

```sh
cd frontend
npm install
npm run dev
```

Start the existing backend and PostgreSQL separately using the backend README.
Open the URL printed by Vite, normally http://localhost:5173. In PowerShell, use
`npm.cmd` if execution policy blocks `npm.ps1`.

```sh
npm run lint
npm test
npm run build
npm run preview
```

Lint retains the existing Oxlint configuration. Tests use Node's built-in runner
and require no additional framework. `build` writes `dist/`; `preview` serves the
production build locally and is not a production hosting server.

## API configuration

Optionally copy `.env.example` to `.env.local` (`Copy-Item` on PowerShell):

```dotenv
API_PROXY_TARGET=http://localhost:8080
```

The centralized browser client always uses same-origin `/api`. Both Vite
servers strip that prefix and forward to the server-only `API_PROXY_TARGET`.
The default is `http://localhost:8080`; restart the server when changing it.
Absolute legacy `VITE_API_BASE_URL` values remain a server-side fallback.
Backend hostnames are not compiled into browser production bundles.

Actual deployment needs a web-server/reverse-proxy rule forwarding `/api/*` to
the backend with `/api` stripped, plus an independent frontend SPA fallback to
`index.html`. Vite's local proxy configuration is not a deployed hosting setup.

Admin API contracts used:

- `GET /classes`: class summaries with `id`, `name`, `totalSeats`, `heldSeats`,
  `confirmedSeats`, and `availableSeats`.
- `GET /classes/{classId}`: one class summary. Invalid UUIDs are rejected locally;
  backend 404 responses show a distinct not-found state.
- `POST /classes`: JSON `{ name, totalSeats }`; expects 201 with `id`, `name`,
  and `totalSeats`. Duplicate 409 and validation 400 ProblemDetails are preserved.

Admin requests do not send `X-Student-Id`. All displayed data comes from the API;
there are no sample records or mock fallbacks in the application.

## Routes and modal history

| URL | Content |
| --- | --- |
| `/` | Redirects to `/admin` |
| `/admin` | Dashboard metrics, occupancy, read-only class summary |
| `/admin/classes` | Admission Classes with client-side search |
| `/admin/classes/:classId` | Class-specific details and utilization |
| `/admin/classes/new` | Redirects to `/admin/classes?create=class` |
| Any admin view with `?create=class` | Shared Create Admission Class modal |
| Other paths | Page-not-found state |

Parent routes:

| URL | Content |
| --- | --- |
| `/parent` | Welcome and Student Birth Registration Number selection |
| `/parent/classes` | Public class browsing with class/shift filters |
| `/parent/classes/:classId` | Public capacity details and Hold My Seat |
| `/parent/holds/:holdId` | Owned reservation, server status and expiry countdown |
| `/parent/holds/:holdId/review` | Review and confirm admission |
| `/parent/holds/:holdId/success` | Server-verified confirmation outcome |
| `/parent/applications` | Active student's history, details and cancellation |

Dashboard, list, and sidebar actions open the same modal on the current page.
The current underlying sidebar item stays active. Opening adds a history entry;
Back/Escape/Cancel close it, Forward reopens it, and directly loading a modal URL
also works. Form state resets when the modal closes. Closing restores the opener's
focus, or focuses the main region if navigation removed that opener.

The native dialog provides a top-layer backdrop and inert background. Explicit
Tab/Shift+Tab wrapping, initial field focus, Escape handling, scroll locking,
labels, inline errors, and persistent live announcements support keyboard use.
Close, Escape, backdrop clicks, duplicate submits, and in-app/history navigation
are blocked while a POST is pending. A failed or timed-out POST may have reached
the server; the UI asks users to check the list before trying again. No automatic
POST retry is performed.

## Feature structure and reuse

```text
src/
  App.jsx                            Existing browser-router configuration
  api/client.js                      Shared same-origin HTTP client
  components/admin/                  F1 layout, sidebar, route header
  components/ui/
    LiveAnnouncement.jsx             Persistent polite status outside busy content
    RequestState.jsx                 Shared loading/error/retry presentation
  features/classes/
    pages/ClassesPage.jsx             Thin searchable-list view
    pages/ClassDetailsPage.jsx        Thin parameter-driven detail view
    components/ClassesTable.jsx       Shared F2/F3 table with real-ID links
    components/ClassDetailsStats.jsx  Reuses F2 metric cards
    components/CreateClassModal.jsx   One accessible structured form/dialog
    components/CreateClassButton.jsx  Shared dashboard/list entry action
    components/ClassManagementNotice.jsx  Success status
    context/ClassManagementProvider.jsx  Modal URL/history and creation invalidation
    hooks/useClassResource.js         Shared cancellation/timeout/stale guards
    hooks/useClasses.js               List resource
    hooks/useClassDetails.js          Selected-class resource
    hooks/useCreateClass.js           Form, validation, POST and navigation guard
    services/classService.js          GET/POST, contracts and ProblemDetails
    helpers/                         Search, naming/validation and utilization
    classes.css                      Class management/modal styles
  features/dashboard/                F2 presentation, totals and shared primitives
  styles/tokens.css                  Colors, spacing, typography, shapes
```

The F2 dashboard wraps the shared `useClasses` hook and uses `ClassesTable`.
Shared request state and live-region primitives were extracted without adding a
second API client or state-management dependency. The existing F2 formatter,
metric cards, table/seat styling, and design tokens are reused.

## Data and state behavior

GET requests have a 15-second timeout and cancel on unmount/parameter change.
Snapshots are keyed by resource ID, refresh version, and creation revision, so a
previous class cannot flash or overwrite the selected class. Refresh is manual,
with no polling or overlapping active GETs. Errors never display false zero data.

Dashboard totals sum actual response fields, including backend-provided
availability. Zero classes produce zero totals and an informative empty state.
Search trims whitespace, matches class/shift names case-insensitively, and
preserves the input while filtering. No matches and an empty database have
separate states. All classes are shown in server order, without pagination.

Details fetch the selected UUID directly. Utilization is held plus confirmed,
divided by capacity, with a zero-denominator guard. The displayed percentage is
rounded; visual width and progressbar numeric semantics are clamped to 0-100.

The creation form has exactly three required inputs: Class (Play, Nursery, KG,
Class 1-10), Shift (Morning/Day), and Total Seats (integer 1-2,147,483,647, matching
the backend). One helper generates `<Class> - <Shift> Shift`. No free-text name
field is used. The form retains values on duplicate, validation, and network
failures and prevents concurrent POSTs.

Successful creation shows a polite confirmation, closes the modal, navigates to
the list, clears an old search filter, and invalidates class resources. The list
refetches, and returning to Dashboard loads fresh totals. The UI does not insert
an optimistic or fabricated row.

## Visual reference and responsive behavior

The unmodified Canva HTML and screenshots in `../docs/` guide the appearance.
No Canva SDK, CDN styling script, demo records, or manual prototype event wiring
is executed. F1's 244px navy sidebar, white header, light workspace, blue accent,
self-hosted DM Sans/Work Sans fonts, and rounded cards are retained. Updated text
and form colors meet normal-text AA contrast on their actual surfaces.

Navigation moves above the workspace below 850px, with visible labels, then
stacks below 600px. Cards use four, two, or one columns; tables scroll within
keyboard-focusable regions and long names wrap. The modal fits the viewport and
scrolls internally when necessary. Header profile text is a static design
placeholder; there is no authentication, Logout, or notification workflow.

## Verification

`npm test` covers API URLs/proxies, GET/POST contracts and failures, search,
all class/shift names, form validation/limits, utilization, dashboard totals,
announcements, and text contrast. Test fixtures are confined to test files and
are never used as application fallback data. Browser verification additionally
covers live API flows, dialog focus/history, cancellation/stale selection,
errors, and 1440/900/768/375px layouts. Live POST verification creates persistent
class records; their names and IDs are reported for review without deleting data.

## Parent Portal architecture and behavior

`features/parent/` contains thin `pages/`, reusable presentation `components/`,
`hooks/`, `services/`, `helpers/`, scoped `parent.css`, and two small contexts:

- `StudentProvider` stores the exact 17-digit string in tab-scoped `sessionStorage`.
  Leading zeroes are preserved; invalid or unavailable storage is handled safely.
  Changing students synchronously aborts registered requests, invalidates the old
  session and remounts student-scoped state. No localStorage or student logging.
- `ParentDataProvider` shares and deduplicates `/me/holds` reads. Its eligibility
  state fails closed while loading or on errors. A separate class-data revision
  invalidates the reused F2/F3 class hooks after parent mutations.
- `holdService` uses the existing `/api` client; `admissionService` checks current
  applications and ownership before mutations. `useStudentAction` prevents double
  submission, handles timeout/unmount/student changes and refreshes server data.
- `useOwnedHold` checks the selected student's history before requesting public
  hold details. `useHoldCountdown` derives time from the original `expiresAt`,
  stops timers on unmount, and reconciles elapsed holds with the backend.

Rejected actions invalidate owned-reservation snapshots as well as class data.
The reservation refetches through the ownership check and public hold endpoint;
failed reconciliation shows an error instead of retaining an actionable HELD
snapshot. Operation state is scoped to the selected student and class/hold ID,
so navigation aborts requests and discards obsolete completion callbacks.

At countdown zero, a reservation view makes at most five sequential status
checks (immediately, then after 2, 5, 10 and 20 seconds from each completed
check). Checks stop on terminal status, errors, navigation or student changes.
If the server still reports HELD after the budget, Refresh status remains
available. The original `expiresAt` is never rewritten or restarted.

The Node test suite also runs isolated React lifecycle regressions in headless
Chrome/Chromium (or Edge). It detects common installed browser paths; set
`PARENT_TEST_CHROME` to the executable path when needed. These tests launch their
own Vite server and temporary browser profile and intercept every `/api` request,
so they never create backend records. They are explicitly skipped if no supported
browser is installed. Live API verification is performed separately.

Parent API contracts used (no backend changes):

| Endpoint | Request | Expected response |
| --- | --- | --- |
| `GET /classes`, `GET /classes/:id` | No student header | Class summaries |
| `GET /me/holds` | `X-Student-Id` | Current student's application array |
| `POST /classes/:id/holds` | `X-Student-Id`, no body | 201, full hold UUID and actual expiry |
| `GET /holds/:id` | No student header; UI first checks ownership | Hold status and expiry |
| `POST /holds/:id/confirm` | `X-Student-Id`, no body | 200, confirmed hold |
| `DELETE /holds/:id` | `X-Student-Id`, no body | 204, empty body (never parsed as JSON) |

Browsing works without a number. Holding requires a valid student, available
capacity and verified application status. Immediately before hold creation or
confirmation, a fresh `/me/holds` check blocks a second admission when any other
application is CONFIRMED, names that class and links to My Applications. HELD,
EXPIRED and CANCELLED history does not impose that global restriction. Failed
verification prevents mutation; retry is explicit. This is a frontend UX guard,
not a backend invariant. Independent tabs or clients can race after verification;
student identification is not authentication. The countdown uses the device
clock, while backend status and mutation responses remain authoritative.

Hold/review/success/application screens display the full student number and Hold
ID. Success URLs recheck server state and cannot manufacture a confirmation.
The backend permits cancellation of HELD and CONFIRMED applications; the native
confirmation dialog starts on Keep application, traps keyboard focus, supports
Escape, and announces errors outside busy controls. Status live regions remain
outside busy content; countdown seconds are not repeatedly announced.

The parent shell retains the navy/white/blue Canva palette and self-hosted fonts.
Class cards use three columns on desktop, two on tablet and one on mobile. The
sidebar moves above content at 768px; filters and summary rows stack on narrow
screens. Checks cover 1440/900/768/375px, keyboard interaction, student isolation,
late responses, API failures and real create/confirm/cancel flows. Tests include
leading-zero storage, filters, confirmed/held/expired/cancelled eligibility,
loading/errors, ownership, cancellation, contracts and countdown calculations.
