# School Admission System Frontend

F2 implements the admin dashboard using real `GET /classes` data inside the F1
React + Vite shell. Admission Classes, Class Details, and Create Class remain
F3-F5 placeholders. The shared sidebar, header, fonts, and layout are reused.

## Requirements and installation

- Node.js 22.12 or newer and npm.

From the repository root:

```sh
cd frontend
npm install
```

On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd` instead of `npm`.

## Development

From `frontend/`:

```sh
npm run dev
```

Open the URL printed by Vite (normally http://localhost:5173). Run the existing
backend and PostgreSQL separately, following the backend README. The dashboard
shows an error and Retry when the API is unavailable; there is no mock fallback.

## Build, lint, and preview

```sh
npm run lint
npm test
npm run build
npm run preview
```

`build` writes production assets to `dist/`. `preview` serves that build locally;
it is not a production hosting server. Both development and preview forward
same-origin `/api` requests to the configured backend, so a normal build followed
by preview can display real dashboard data without backend CORS changes.
Oxlint retains the F0 `.oxlintrc.json`. `npm test` uses Node's built-in runner for
API URL/proxy behavior, the class-service contract, dashboard calculations,
announcements, and text contrast; it requires no additional test dependencies.

## Routes

| URL | Screen | Current content | Active sidebar link |
| --- | --- | --- | --- |
| `/` | Redirect | Replaces the history entry with `/admin` | Dashboard |
| `/admin` | Dashboard | Live metrics, occupancy, and read-only class summary | Dashboard |
| `/admin/classes` | Admission Classes | Coming in F3 | Admission Classes |
| `/admin/classes/:classId` | Class Details | Coming in F4; back link | Admission Classes |
| `/admin/classes/new` | Create Class | Coming in F5 | Create Class |
| Other URLs | Page not found | Link to Dashboard | None |

React Router handles browser navigation and history. The static `new` route has
priority over the class ID parameter. `NavLink` supplies active styles and
`aria-current`; the classes link includes details but excludes the creation route.
For production hosting, configure an SPA fallback to `index.html` for frontend
routes. Vite's development and preview servers already support direct refreshes.

## Environment and API client

Optionally copy `.env.example` to `.env.local`:

```sh
cp .env.example .env.local
```

On PowerShell, use `Copy-Item .env.example .env.local`.

```dotenv
API_PROXY_TARGET=http://localhost:8080
```

`src/api/client.js` always uses the same-origin `/api` prefix, in development,
preview, and production builds. Backend addresses are not embedded in browser
bundles. `API_PROXY_TARGET` is a server-only Vite setting; unset or blank values
default to `http://localhost:8080`, and trailing slashes are removed. It may also
be set in the shell that starts Vite. Restart development or preview after
changing the target. Preview uses production-mode environment files, plus
`.env` / `.env.local`, just as Vite does normally.

Older absolute `VITE_API_BASE_URL` values remain supported only as a server-side
fallback when `API_PROXY_TARGET` is not supplied. Migrate local configuration to
`API_PROXY_TARGET`; the browser no longer reads `VITE_API_BASE_URL`.

Feature services import `apiClient(path, options)` to call paths relative to
that base URL. It returns the native fetch `Response`; callers will handle status
codes and response bodies according to the endpoint contract. Importing the client
does not trigger a request. Visual components contain no API URLs or fetch calls.
Local environment files, dependencies, and build output are ignored;
`.env.example` is shareable.

For example, the browser requests `/api/classes` from the development or preview
origin. Vite strips `/api` and forwards `/classes` to `API_PROXY_TARGET`. Both
server modes use the same explicit proxy rules; `/apiary` and other unrelated
paths are not matched.

Actual production deployment is different from Vite preview. Configure the web
server, reverse proxy, or hosting platform to forward `/api/*` to the real
backend, stripping `/api` to preserve backend paths such as `/classes`. Also
configure the frontend SPA history fallback separately. `API_PROXY_TARGET` only
controls Vite's local servers; it does not configure deployed hosting. Neither
Vite proxy rules nor the backend target are bundled into the static browser app.

## Component structure

```text
src/
  App.jsx                         Browser router and route metadata
  main.jsx                        React root and local font imports
  index.css                       Reset, typography, focus, cards and buttons
  styles/tokens.css               Shared color, font, spacing and shape tokens
  components/admin/
    AdminLayout.jsx               Sidebar, header and nested route outlet
    AdminSidebar.jsx              Brand, three NavLinks and workspace footer
    AdminHeader.jsx               Route title and static admin profile visual
    admin.css                     Shell layout and responsive styles
  pages/
    MilestonePlaceholder.jsx      Shared F3-F5 placeholder
    NotFound.jsx                  Unknown-route fallback
  api/client.js                   Shared API base URL and fetch wrapper
  api/client.test.js              Same-origin URL and side-effect checks
  features/classes/services/
    classService.js               GET /classes and response validation
    classService.test.js          Request, failure and response contract checks
  features/dashboard/
    DashboardPage.jsx             Composes the dashboard view
    dashboard.css                 Scoped responsive dashboard styles
    components/
      DashboardIntro.jsx          Intro, refresh and create navigation
      MetricCard.jsx              Reusable value, caption and icon card
      SeatOccupancy.jsx           Stacked bar and labelled seat totals
      DashboardClassTable.jsx     Read-only table and empty state
      DashboardState.jsx          Loading and error/retry presentation
      DashboardAnnouncement.jsx   Persistent live region outside busy content
    hooks/useDashboardClasses.js  Loading, errors, cancellation and refresh
    model/
      dashboardSummary.js         Pure totals and safe bar proportions
      dashboardSummary.test.js    Empty, zero-capacity and inconsistent-count checks
      formatCount.js              Shared numeric presentation
      dashboardAnnouncement.js    Loading, success, empty and error messages
      dashboardAnnouncement.test.js Announcement contract checks
```

`vite.config.test.js` checks shared development/preview proxy behavior and target
configuration. `src/styles/tokens.test.js` checks normal-text contrast against the
actual shared color values.

## Design reference and responsive behavior

Based on the user-approved Canva prototype in `../docs/canva_admin_reference.html`
and the four supplied screenshots in `../docs/`. Those files are visual references
and are preserved unchanged. The production app does not execute their scripts.

- A fixed 244px navy sidebar (`#142446`), white header, and light workspace
  (`#f6f8fc`) follow the prototype's proportions.
- Blue (`#3867df`), ink (`#182744`), muted text (`#62718a`), and border
  (`#e7edf5`) tokens are centralized. Held orange and confirmed green tokens
  are used for the dashboard's seat categories, with darker accessible text colors.
  Muted text has at least 4.65:1 contrast on the workspace, white cards, table
  header, and legend backgrounds. Held text (`#a35c1b`) has at least 4.62:1 on
  those surfaces and the held-icon background. Both meet 4.5:1 for normal text.
- DM Sans body and Work Sans headings are self-hosted using Fontsource packages,
  with system fallbacks. Lucide React supplies icons through normal React rendering.
- Cards use 18px corners, a thin border, and a subtle shadow. Spacing follows a
  shared 4px scale, with 36px desktop content gutters.
- At 850px and below, navigation moves above the workspace with three labelled
  links. At 600px and below, links stack, gutters narrow, and profile text hides.
  Navigation labels remain visible. The mobile shell has no collapsed menu.
- Semantic landmarks, a skip link, visible focus outlines, labelled navigation,
  and reduced-motion support are included.

The header initials and profile text are static design placeholders. There is no
login, session, notification workflow, or Logout control.

## Dashboard data and refresh behavior

The classes service makes only `GET /classes`, with `Accept: application/json`
and no student identity header or request body. It expects the backend's camel-case
JSON array of `id`, `name`, `totalSeats`, `heldSeats`, `confirmedSeats`, and
`availableSeats`. HTTP failures, invalid JSON, malformed records, and network
errors fail explicitly instead of being treated as empty data.

The custom hook is the view-model layer: it owns the initial load, loading/error
state, Retry, and manual Refresh. Requests use AbortController, cancel on unmount,
and time out after 15 seconds. Refresh is disabled while loading, requests do not
overlap, and there is no polling. Use Refresh to retrieve current hold and
confirmation totals. A refresh clears the old snapshot while retrieving new data;
an error never displays authoritative-looking zero statistics.

A single persistent, polite live region sits outside the busy dashboard content.
It is mounted empty before its first message is inserted, announces loading,
success, empty results, and errors, and retains the same DOM node through state
changes. Visual loading, empty, and retry panels do not add competing live
regions. Ordinary rerenders with the same status do not repeat announcements.

The pure summary helper sums the actual API fields. Available seats are summed
from `availableSeats`, not reconstructed from capacity. Occupied percentage is
`round((confirmed + held) / total * 100)`, with zero capacity returning 0. The bar
uses these same counts; if their sum exceeds capacity, only the segment widths
are normalized to fit. Reported counts and the occupied percentage stay intact.

A successful empty array displays zero metrics, a zero-capacity bar, and
"No admission classes yet". All returned classes appear in the summary table,
in backend order, without pagination. Long names wrap; the table scrolls within
its own keyboard-focusable region on narrow screens. The metric grid has four
columns at 1280px and above, two below that, and one at 600px and below.

## Milestone boundary

F2 includes only the dashboard. View all classes, View Details, and Create
Admission Class navigate to the existing F3-F5 placeholders. The full class-list
page, search/filtering, actual details screen, creation form/modal, and POST
requests remain deferred. No fake class records or counts are shipped. Fixtures
inside `.test.js` files exist only for isolated verification and are not imported
by the application.

For F5, the approved creation fields are Class dropdown (Play, Nursery, KG,
Class 1-10), Shift (Morning/Day), and Total Seats. Do not restore the reference's
free-text class-name input. Backend and database configuration remain out of scope.
