# How I used AI during development

I used ChatGPT for planning and technical discussion, and Codex as my coding
assistant inside VS Code. I directed the work through scoped milestones, reviewed
reports, screenshots and test results, and requested audits and follow-up fixes.
AI generated or modified substantial parts of the implementation. I do not present
this project as work developed without AI assistance.

## Planning and design with ChatGPT

I used ChatGPT to understand the assignment, clarify business rules, compare
alternatives and review architecture. It helped me turn the brief into backend,
frontend and deployment milestones and prepare detailed Codex tasks. Our discussions
covered the .NET/PostgreSQL/React/Docker stack, database constraints, API behavior,
concurrency, expiration, edge cases and verification.

I also used those discussions to work through UI/UX choices with my Canva prototypes
and screenshots, understand test results and audit findings, and plan documentation
and submission checks. ChatGPT's role was discussion and guidance; it did not
directly execute all the repository's code or commands.

## Implementation with Codex and Canva Code

I supplied scoped tasks and prompts to Codex. It helped implement the ASP.NET Core
APIs, PostgreSQL integration and EF migrations; reusable React components, hooks
and services; automated tests; bug fixes; and Docker deployment. It also ran
commands, API checks, browser verification and read-only audits where the
environment allowed them.

I used **Canva Code** to explore UI prototypes. The prototypes and screenshots
guided the appearance. The final interface was adapted into reusable React
layouts, components, design tokens, hooks and API services. Canva's sample data,
SDK scripts and imperative prototype state are not the production application.

## Milestones and review workflow

Git records these implementation commits and their feature-branch merges. The
labels describe the workflow I directed; they do not imply that every original
prompt is still available.

| Work | Git/development evidence |
| --- | --- |
| M1 — Backend foundation | `c3c4dfa` |
| M2 — Database setup | `7c7dfdb` |
| M3 — Class management | `4414471` |
| M4 — Seat holds and concurrency | `26b160e` |
| M5 — Hold lifecycle | `7baceb3` |
| M6 — Automatic expiration | `4cbded1` |
| F0 — React/Vite setup | `e593411` |
| F1 — Admin design foundation | `9c1c873` |
| F2 — Admin dashboard | `6e9f4ae` |
| F3–F5 — Classes, details and creation | `7a52e54` |
| F6–F8 — Parent Admission Portal | `46a13e8` |
| D1 — Docker assessment | Read-only assessment in the development conversation |
| D2–D3 — Docker implementation/integration | Dockerfiles, Compose, Nginx and observed integration checks in the current working tree |
| D4–D5 — Documentation/final audit | Submission documents and final verification; changes await review without a deployment commit/merge |

My normal cycle was to discuss requirements with ChatGPT, supply a small task to
Codex, review its changes and evidence, request a read-only audit, and have issues
fixed and retested. Completed backend/frontend milestones were committed through
feature branches and merged into main. Deployment work remains on
`feature/fullstack-docker` for final review; Codex has not committed, pushed or
merged this final phase.

M1 and M6 task files can be recovered from Git history. Local F1, F2, F3–F5 and
F6–F8 tasks also informed the review. Separate M2–M5 and F0 tasks were unavailable,
so this disclosure uses commits, source and tests rather than inventing prompts.
Temporary tasks and visual references are not submission documents.

## Where review and testing mattered

AI suggestions needed checking against the actual brief. The initial Docker
assessment proposed keeping the API internal. Reading the PDF showed that the
assignment also expects localhost:8080 access, so deployment publishes it. A live
integration check caught an Nginx `Location` rewrite that dropped the published
frontend port; Codex corrected it and reran the API checks. Container logs also
exposed a missing native library in the migration image, which was added.

The PDF review found that earlier frontend choices did not fully meet mandatory
periodic seat refresh and idle application-history expiry requirements. Browser
reopening also requires re-entering identity; application recovery after that step
was verified, and the interpretation is documented separately in
[ASSUMPTIONS.md](ASSUMPTIONS.md). The frontend-only restriction after confirmation
is explicitly distinguished from backend enforcement. Passing existing tests
alone therefore did not make the assignment ready. I then asked Codex to fix the
two mandatory UI gaps using the existing hooks/services, without changing backend
contracts. It added serial class refresh, bounded expiry reconciliation and 17
browser regressions. Live Docker checks verified both fixes without reload.

Final verification observed 189 backend tests passing against real PostgreSQL,
81 frontend tests passing, successful lint/build, all eight APIs through Nginx,
the live browser admission flow, automatic expiry and data persistence across
Compose down/up. Sandbox browser failures and an intermittent browser-test failure
were investigated; the latter passed in isolation and on the final full rerun.
A skipped or unperformed check was not treated as a pass. The 189-test backend
result is from the deployment phase; its source did not change during the UI fix.

AI helped with implementation speed and edge cases, but generated changes and
explanations can miss requirements or make incorrect assumptions. Source review,
database-backed concurrency tests, browser checks and comparison with the official
brief remain essential. I am responsible for reviewing the final changes and
deciding what to submit. The two reported UI gaps are now resolved and tested;
documented limitations, including re-entering identity after browser closure,
remain visible rather than being hidden by a readiness label.
