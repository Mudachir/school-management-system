FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY .config/dotnet-tools.json .config/dotnet-tools.json
COPY SchoolAdmission.Api/SchoolAdmission.Api.csproj SchoolAdmission.Api/
RUN dotnet tool restore \
    && dotnet restore SchoolAdmission.Api/SchoolAdmission.Api.csproj
COPY SchoolAdmission.Api/ SchoolAdmission.Api/
RUN dotnet publish SchoolAdmission.Api/SchoolAdmission.Api.csproj \
    --configuration Release --no-restore --output /out/api /p:UseAppHost=false
# Design-time context creation needs configuration, but never a live database.
# Real connection strings are provided only when the migration container runs.
RUN ConnectionStrings__DefaultConnection="Host=postgres;Database=build_only;Username=build_only;Password=build_only" \
    dotnet ef migrations bundle --project SchoolAdmission.Api \
    --startup-project SchoolAdmission.Api --configuration Release \
    --output /out/efbundle

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*

FROM base AS migration
COPY --from=build /out/efbundle ./efbundle
COPY SchoolAdmission.Api/appsettings.json ./appsettings.json
USER $APP_UID
ENTRYPOINT ["./efbundle"]

FROM base AS runtime
COPY --from=build /out/api/ ./
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "SchoolAdmission.Api.dll"]
