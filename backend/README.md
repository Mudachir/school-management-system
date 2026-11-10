# Backend Milestone 1

The backend is a single ASP.NET Core Web API targeting .NET 10, with an xUnit
integration test project. Future modules will live within the API project.

From Git Bash:

```bash
cd '/k/School Management/backend'
dotnet restore SchoolAdmission.sln
dotnet build SchoolAdmission.sln --no-restore
dotnet test SchoolAdmission.sln --no-build

cd SchoolAdmission.Api
ASPNETCORE_URLS=http://localhost:8080 dotnet run --no-launch-profile
```

In a second terminal:

```bash
curl -i http://localhost:8080/health
```

The only endpoint is controller-based `GET /health`, returning HTTP 200 with
`{"status":"healthy"}`.

Configuration uses standard ASP.NET Core providers, including environment variables:

- `ASPNETCORE_URLS` sets the listening address; no port is hard-coded.
- `HOLD_DURATION_SECONDS` defaults to `600` when absent. Startup fails if the value
  cannot be parsed as a positive 32-bit integer. This only prepares configuration;
  no seat hold behavior is implemented.
- `ConnectionStrings__DefaultConnection` will supply the PostgreSQL connection
  string in a later milestone. Its committed value is empty. No database is
  required or contacted in Milestone 1. Keep real credentials out of source control.
