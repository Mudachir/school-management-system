using Microsoft.EntityFrameworkCore;
using Npgsql;
using SchoolAdmission.Api.Data;

namespace SchoolAdmission.Tests.PostgreSql;

public sealed class PostgresFixture : IAsyncLifetime
{
    private DbContextOptions<AppDbContext>? options;

    public async Task InitializeAsync()
    {
        var connectionString = Environment.GetEnvironmentVariable(PostgresTestSettings.ConnectionVariable);
        if (string.IsNullOrWhiteSpace(connectionString))
            return; // Tests report SKIP; no database work is attempted.

        var connection = new NpgsqlConnectionStringBuilder(connectionString);
        if (connection.Database != PostgresTestSettings.DatabaseName)
            throw new InvalidOperationException(
                $"Database tests require Database={PostgresTestSettings.DatabaseName}; no schema changes were attempted.");

        options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection.ConnectionString).Options;
        await using var context = new AppDbContext(options);
        // Only the explicitly named test database is migrated. Never delete a database.
        await context.Database.MigrateAsync();
    }

    public AppDbContext CreateContext() =>
        new(options ?? throw new InvalidOperationException("PostgreSQL tests are not configured."));

    public async Task<AppDbContext> CreateTransactionalContextAsync()
    {
        var context = new AppDbContext(options ?? throw new InvalidOperationException("PostgreSQL tests are not configured."));
        try
        {
            // Disposing the context rolls back the owned transaction, including failed writes.
            await context.Database.BeginTransactionAsync();
            return context;
        }
        catch
        {
            await context.DisposeAsync();
            throw;
        }
    }

    public Task DisposeAsync() => Task.CompletedTask;
}
