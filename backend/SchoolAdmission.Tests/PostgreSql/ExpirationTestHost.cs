using System.Collections.Concurrent;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;
using SchoolAdmission.Api.Background;

namespace SchoolAdmission.Tests.PostgreSql;

internal sealed class ExpirationTestHost : IAsyncDisposable
{
    public WebApplicationFactory<Program> Factory { get; }
    public HoldExpirationWorker Worker { get; }
    public ExpirationLogProbe Logs { get; } = new();
    public string ConnectionString { get; }

    public ExpirationTestHost(HoldApiTestScope data, TimeProvider clock, string pollSeconds = "1",
        IInterceptor? interceptor = null, string? connectionOverride = null)
    {
        using var context = data.CreateContext();
        ConnectionString = context.Database.GetConnectionString()!;
        var connection = new NpgsqlConnectionStringBuilder(connectionOverride ?? ConnectionString);
        if (connection.Database != PostgresTestSettings.DatabaseName)
            throw new InvalidOperationException("Expiration tests require the dedicated test database.");

        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.ConfigureAppConfiguration((_, configuration) =>
            {
                configuration.Sources.Clear();
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:DefaultConnection"] = connection.ConnectionString,
                    ["HOLD_EXPIRATION_POLL_SECONDS"] = pollSeconds,
                    ["Logging:LogLevel:Default"] = "Debug"
                });
            }).ConfigureLogging(logging => logging.ClearProviders().AddProvider(Logs))
            .ConfigureTestServices(services =>
            {
                services.AddSingleton(clock);
                if (interceptor is not null)
                    services.ConfigureDbContext<SchoolAdmission.Api.Data.AppDbContext>(options => options.AddInterceptors(interceptor));
            }));
        try
        {
            // Starting TestServer starts the real DI-registered worker, with ZERO HTTP requests.
            _ = Factory.Server;
            Worker = Factory.Services.GetServices<IHostedService>().OfType<HoldExpirationWorker>().Single();
        }
        catch
        {
            Factory.Dispose();
            throw;
        }
    }

    public async ValueTask DisposeAsync() => await Factory.DisposeAsync();

    public static async Task EventuallyAsync(Func<Task<bool>> condition)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        while (!await condition())
            await Task.Delay(20, deadline.Token);
    }
}

internal sealed class ExpirationTestClock(DateTimeOffset now) : TimeProvider
{
    private long ticks = now.UtcTicks;
    public override DateTimeOffset GetUtcNow() => new(Interlocked.Read(ref ticks), TimeSpan.Zero);
    public void SetUtcNow(DateTimeOffset value) => Interlocked.Exchange(ref ticks, value.UtcTicks);
}

internal sealed class ExpirationLogProbe : ILoggerProvider
{
    private readonly ConcurrentQueue<(LogLevel Level, string Message)> entries = new();
    private readonly ConcurrentQueue<int> counts = new();
    public (LogLevel Level, string Message)[] Entries => entries.ToArray();
    public int[] ExpiredCounts => counts.ToArray();
    public ILogger CreateLogger(string categoryName) => new ProbeLogger(this, categoryName);
    public void Dispose() { }

    private sealed class ProbeLogger(ExpirationLogProbe owner, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => category == typeof(HoldExpirationWorker).FullName;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel)) return;
            owner.entries.Enqueue((logLevel, formatter(state, exception)));
            if (state is IEnumerable<KeyValuePair<string, object?>> values)
                foreach (var value in values)
                    if (value.Key == "ExpiredCount" && value.Value is int count)
                        owner.counts.Enqueue(count);
        }
    }
}
