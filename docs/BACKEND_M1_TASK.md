# Backend Milestone 1 — Foundation (Codex-ready task)

**This task is small on purpose.** No admission business logic, database setup or frontend changes yet.

## Codex prompt (copy and paste)

> Work in my EXISTING Git repository rooted at `K:\School Management` (Git Bash path `/k/School Management`). Git is already initialized; DO NOT run git init or create nested repositories. Carefully inspect existing files before changing anything.
>
> Implement **only Backend Milestone 1 — ASP.NET Core Web API Foundation**. The employer requires .NET 8+, React 18+, PostgreSQL, Docker eventually; my backend targets **.NET 10**. Create a `backend/SchoolAdmission.sln` solution, `backend/SchoolAdmission.Api` ASP.NET Core controller-based Web API, and `backend/SchoolAdmission.Tests` xUnit test project. Use a clean, small structure appropriate for a modular monolith without creating extra architecture projects or generic repositories.
>
> Expose ONLY `GET /health` as a test endpoint, returning HTTP 200 and JSON `{ "status": "healthy" }`. Use an MVC controller. Make API port configurable through standard ASP.NET Core hosting; the reviewer will later access it at `http://localhost:8080`.
>
> Read `HOLD_DURATION_SECONDS` from configuration with default 600; reject non-positive/non-integer configuration with clear startup feedback. Prepare to later use a PostgreSQL connection string from `ConnectionStrings__DefaultConnection`, but do NOT add EF Core packages, connect to a DB, add migrations, Dockerfiles, admission models/endpoints, business services, authentication, Swagger dependencies unless already required, or frontend changes in this milestone.
>
> Add one meaningful xUnit integration-style test using `WebApplicationFactory<Program>` that sends GET `/health` and checks HTTP 200 plus `status == "healthy"`. Make `Program` accessible to the test project as needed. Do not add dummy tests.
>
> Keep root `.gitignore` appropriate for .NET artifacts (`bin/`, `obj/`, IDE secrets) without overwriting unrelated existing content. Don't accidentally commit a real secret. Keep code and naming simple and readable.
>
> At the end, list all created/changed files, describe how to run in Git Bash, report the exact build/test outputs actually observed, and note any checks that could not run. Do not claim a test passed unless it ran. Stop after M1; do not continue into M2.

## Git Bash verification (after Codex changes)

From project root:
```bash
cd '/k/School Management'
git status --short
cd backend
dotnet restore SchoolAdmission.sln
dotnet build SchoolAdmission.sln --no-restore
dotnet test SchoolAdmission.sln --no-build
```

Then in terminal A, from `backend/SchoolAdmission.Api`:
```bash
ASPNETCORE_URLS=http://localhost:8080 dotnet run --no-launch-profile
```

In a separate Git Bash terminal B:
```bash
curl -i http://localhost:8080/health
```

Expected: HTTP 200 and `{ "status": "healthy" }` (format/whitespace may differ).

**Only after you verify** tests and review the diff:
```bash
cd '/k/School Management'
git diff --check
git status --short
```

Do not commit until the generated changes have been reviewed. Share Codex's change summary, `dotnet build`, `dotnet test`, and `curl` output for review.

## Completion checklist

- [ ] Existing repository preserved
- [ ] Solution + API + xUnit project scaffolded
- [ ] Controller-based `GET /health` returns required response
- [ ] Config reads and validates positive `HOLD_DURATION_SECONDS`, default 600
- [ ] PostgreSQL not required for M1 startup
- [ ] `dotnet restore` succeeded
- [ ] `dotnet build` succeeded
- [ ] `dotnet test` passed actual HTTP-pipeline health test
- [ ] `curl` verified listening at port 8080
- [ ] Code reviewed and committed as a small milestone
