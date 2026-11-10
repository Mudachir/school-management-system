# School Admission System Frontend

F1 provides the shared admin UI foundation in React and JavaScript with Vite.
The sidebar, header, navigation, design tokens, and API client configuration are
ready for later milestones. All four feature screens are placeholders.

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

Open the URL printed by Vite (normally http://localhost:5173). The F1 shell does
not require a running backend and makes no API calls.

## Build, lint, and preview

```sh
npm run lint
npm run build
npm run preview
```

`build` writes production assets to `dist/`. `preview` serves that build locally;
it is not a production hosting server. Oxlint retains the F0 `.oxlintrc.json`.
No automated test runner is configured.

## Routes

| URL | Screen | F1 content | Active sidebar link |
| --- | --- | --- | --- |
| `/` | Redirect | Replaces the history entry with `/admin` | Dashboard |
| `/admin` | Dashboard | Coming in F2 | Dashboard |
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
VITE_API_BASE_URL=http://localhost:8080
```

`src/api/client.js` reads `import.meta.env.VITE_API_BASE_URL`. An unset or blank
value defaults to `http://localhost:8080`; trailing slashes are removed. Set the
value to your local API address when integrating later milestones. Restart Vite
after changing an environment file; production values are set at build time.
Vite-prefixed values are public browser configuration, so never put secrets here.

Future screens can import `apiClient(path, options)` to call paths relative to
that base URL. It returns the native fetch `Response`; callers will handle status
codes and response bodies according to the endpoint contract. Importing the client
does not trigger a request. Components contain no API URLs. Local environment
files, dependencies, and build output are ignored; `.env.example` is shareable.

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
    MilestonePlaceholder.jsx      Shared F2-F5 placeholder
    NotFound.jsx                  Unknown-route fallback
  api/client.js                   Shared API base URL and fetch wrapper
```

## Design reference and responsive behavior

Based on the user-approved Canva prototype in `../docs/canva_admin_reference.html`
and the four supplied screenshots in `../docs/`. Those files are visual references
and are preserved unchanged. The production app does not execute their scripts.

- A fixed 244px navy sidebar (`#142446`), white header, and light workspace
  (`#f6f8fc`) follow the prototype's proportions.
- Blue (`#3867df`), ink (`#182744`), muted text (`#687892`), and border
  (`#e7edf5`) tokens are centralized. Held orange and confirmed green tokens
  are reserved for later screens without displaying statistics in F1.
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

## Milestone boundary

F1 does not include KPI cards, charts, class tables, actual class details, a create
form/modal, fake admissions data, or API integration. F2 will implement the real
Dashboard screen separately after review.

For F5, the approved creation fields are Class dropdown (Play, Nursery, KG,
Class 1-10), Shift (Morning/Day), and Total Seats. Do not restore the reference's
free-text class-name input. Backend and database configuration remain out of scope.
