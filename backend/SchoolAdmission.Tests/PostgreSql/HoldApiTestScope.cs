using System.Globalization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Domain;

namespace SchoolAdmission.Tests.PostgreSql;

// Committed HTTP writes must not overlap the M3 empty-list/rollback tests.
[CollectionDefinition("Committed PostgreSQL holds", DisableParallelization = true)]
public sealed class CommittedHoldCollection;

internal sealed class HoldApiTestScope : IAsyncDisposable
{
    private readonly DbContextOptions<AppDbContext> options;
    private readonly string connectionString;
    private readonly int? durationSeconds;
    private readonly List<Guid> classIds = [];
    private readonly List<(WebApplicationFactory<Program> Factory, HttpClient Client)> hosts = [];

    public HoldApiTestScope(PostgresFixture fixture, int? durationSeconds = null)
    {
        // The existing fixture validates the exact database name before migrating.
        using var guardedContext = fixture.CreateContext();
        var connection = new NpgsqlConnectionStringBuilder(guardedContext.Database.GetConnectionString())
        {
            ApplicationName = $"m4_tests_{Guid.NewGuid():N}",
            Pooling = false // Each overlapping request uses an independent physical connection.
        };
        if (connection.Database != PostgresTestSettings.DatabaseName)
            throw new InvalidOperationException("Committed tests require the guarded test database.");
        connectionString = connection.ConnectionString;
        ApplicationName = connection.ApplicationName;
        options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options;
        this.durationSeconds = durationSeconds;
        Client = CreateIndependentClient();
    }

    public string ApplicationName { get; }
    public HttpClient Client { get; }
    public AppDbContext CreateContext() => new(options);

    public HttpClient CreateIndependentClient(DbCommandInterceptor? interceptor = null)
    {
        // Exercise production DI and options binding in independent API hosts.
        var settings = new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = connectionString,
            ["Logging:EventLog:LogLevel:Default"] = "None",
            ["Logging:LogLevel:Default"] = "Warning"
        };
        if (durationSeconds.HasValue)
            settings["HOLD_DURATION_SECONDS"] = durationSeconds.Value.ToString(CultureInfo.InvariantCulture);
        var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.ConfigureAppConfiguration((_, configuration) =>
            {
                // Isolate test hosts from shell settings. Missing duration exercises
                // the real options default; a present null would bind int to zero.
                configuration.Sources.Clear();
                configuration.AddInMemoryCollection(settings);
            }).ConfigureTestServices(services =>
            {
                if (interceptor is not null)
                    services.ConfigureDbContext<AppDbContext>(options => options.AddInterceptors(interceptor));
            }));
        try
        {
            var client = factory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(30);
            hosts.Add((factory, client));
            return client;
        }
        catch
        {
            factory.Dispose();
            throw;
        }
    }

    public async Task<AdmissionClass> AddClassAsync(int seats = 5)
    {
        var admissionClass = new AdmissionClass
        {
            Name = $"M4 {Guid.NewGuid():N}", TotalSeats = seats, CreatedAt = DateTime.UtcNow
        };
        classIds.Add(admissionClass.Id);
        await using var context = CreateContext();
        context.Add(admissionClass);
        await context.SaveChangesAsync(); // Intentionally committed and visible to HTTP connections.
        return admissionClass;
    }

    public async Task SeedAsync(params AdmissionHold[] holds)
    {
        if (holds.Any(hold => !classIds.Contains(hold.ClassId)))
            throw new InvalidOperationException("Only this test's class IDs may be seeded.");
        await using var context = CreateContext();
        context.AddRange(holds);
        await context.SaveChangesAsync();
    }

    public async Task<List<AdmissionHold>> HoldsAsync(Guid classId)
    {
        await using var context = CreateContext();
        return await context.AdmissionHolds.AsNoTracking().Where(hold => hold.ClassId == classId).ToListAsync();
    }

    public Task<HttpResponseMessage> PostAsync(Guid classId, string? studentId,
        HttpClient? client = null, CancellationToken cancellationToken = default) =>
        PostAsync(classId.ToString(), studentId, client, cancellationToken);

    public async Task<HttpResponseMessage> PostAsync(string classId, string? studentId,
        HttpClient? client = null, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/classes/{classId}/holds");
        if (studentId is not null)
            request.Headers.TryAddWithoutValidation("X-Student-Id", studentId);
        return await (client ?? Client).SendAsync(request, cancellationToken);
    }

    public async Task<int> WaitForBlockedRequestsAsync(int minimum, CancellationToken cancellationToken)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(15));
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(deadline.Token);
        await using var command = new NpgsqlCommand("""
            SELECT count(*)::int FROM pg_stat_activity
            WHERE datname = current_database() AND application_name = @application
              AND wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%'
            """, connection);
        command.Parameters.AddWithValue("application", ApplicationName);
        while (true)
        {
            var blocked = (int)(await command.ExecuteScalarAsync(deadline.Token))!;
            if (blocked >= minimum)
                return blocked;
            // Poll observed PostgreSQL lock state, not an assumed sleep duration.
            await Task.Delay(10, deadline.Token);
        }
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var host in hosts)
        {
            host.Client.Dispose();
            await host.Factory.DisposeAsync();
        }
        await using var context = CreateContext();
        // Delete only records belonging to this scope's GUIDs, child rows first.
        await using var transaction = await context.Database.BeginTransactionAsync();
        await context.AdmissionHolds.Where(hold => classIds.Contains(hold.ClassId)).ExecuteDeleteAsync();
        await context.AdmissionClasses.Where(item => classIds.Contains(item.Id)).ExecuteDeleteAsync();
        await transaction.CommitAsync();
    }
}
