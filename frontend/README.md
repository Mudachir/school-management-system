# School Admission System Frontend

Admin milestones F1-F5 provide the shared shell, API-connected Dashboard,
searchable Admission Classes page, Class Details, and one shared creation modal.
The parent portal and admission/hold operations are outside this frontend scope.

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
