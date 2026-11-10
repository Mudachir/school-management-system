# School Admission System Frontend

Frontend Milestone F0 provides a React + Vite JavaScript project with a minimal
"School Admission System" placeholder. Application screens and routing are not
implemented yet. React Router is installed for future milestones.

## Requirements

- Node.js 22.12 or newer
- npm (included with Node.js)

Run the following commands from the repository root unless otherwise noted.
On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd` in place of `npm`.

## Installation

```sh
cd frontend
npm install
```

## Development

From `frontend/`:

```sh
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).
The F0 placeholder does not require the backend or environment variables.
Local `.env` and `.env.*` files are ignored; `.env.example` may be committed
when shared configuration is needed.

## Build and preview

From `frontend/`:

```sh
npm run build
npm run preview
```

The production build is written to `dist/`. Preview serves that build locally;
it is not a production hosting server.

## Lint

```sh
npm run lint
```

Oxlint uses the existing `.oxlintrc.json` configuration.
No automated test suite is configured for F0.

## Structure

- `index.html`: HTML entry point and page title.
- `src/main.jsx`: React root with Strict Mode and global styles.
- `src/App.jsx`: F0 placeholder.
- `src/index.css`: Minimal base styles.
- `vite.config.js`: Vite configuration with the React plugin.
- `.oxlintrc.json`: Existing lint rules.
- `package.json` / `package-lock.json`: Scripts and dependency definitions.

Runtime dependencies are React, React DOM, and React Router DOM. Development
dependencies include Vite, its React plugin, React type definitions, and Oxlint.
