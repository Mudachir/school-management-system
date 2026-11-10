using System.Collections.Concurrent;
using System.Data.Common;
using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
using SchoolAdmission.Api.Background;
using SchoolAdmission.Api.Configuration;
using SchoolAdmission.Api.Contracts.Classes;
using SchoolAdmission.Api.Domain;
using Xunit.Abstractions;

namespace SchoolAdmission.Tests.PostgreSql;

[Collection("Committed PostgreSQL holds")]
[Trait("Category", "PostgreSQL")]
public sealed class HoldExpirationTests(PostgresFixture fixture, ITestOutputHelper output) : IClassFixture<PostgresFixture>
{
    private static readonly DateTime Past = new(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Future = new(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTimeOffset Now = new(2030, 1, 1, 0, 0, 0, TimeSpan.Zero);
    private static string LongPoll => HoldExpirationOptions.MaximumPollSeconds.ToString(CultureInfo.InvariantCulture);

    private async Task<HoldApiTestScope> NewDataAsync()
    {
        var data = new HoldApiTestScope(fixture);
        try
        {
            await using var context = data.CreateContext();
            // A global worker must not expire somebody else's leftover test data.
            Assert.False(await context.AdmissionHolds.AnyAsync(),
                "M6 requires an empty dedicated test database before seeding. No worker was started; existing rows were not changed.");
            return data;
        }
        catch { await data.DisposeAsync(); throw; }
    }

    private static AdmissionHold Hold(Guid classId, int student, HoldStatus status, DateTime expiresAt) => new()
    {
        ClassId = classId, StudentId = student.ToString("D17", CultureInfo.InvariantCulture), Status = status,
        CreatedAt = Past.AddDays(-1), ExpiresAt = expiresAt,
        ConfirmedAt = status == HoldStatus.Confirmed ? Past : null,
        CancelledAt = status == HoldStatus.Cancelled ? Past : null
    };

    private static void AssertPreserved(AdmissionHold expected, AdmissionHold actual, HoldStatus status)
    {
        Assert.Equal(expected.Id, actual.Id);
        Assert.Equal(expected.ClassId, actual.ClassId);
        Assert.Equal(expected.StudentId, actual.StudentId);
        Assert.Equal(status, actual.Status);
        Assert.Equal(expected.CreatedAt, actual.CreatedAt);
        Assert.Equal(expected.ExpiresAt, actual.ExpiresAt);
        Assert.Equal(expected.ConfirmedAt, actual.ConfirmedAt);
        Assert.Equal(expected.CancelledAt, actual.CancelledAt);
    }

    [PostgresFact]
    public async Task HostedWorker_ExpiresAcrossClassesWithoutHttpRequestsAndPreservesOtherStates()
    {
        await using var data = await NewDataAsync();
        var first = await data.AddClassAsync(8);
        var second = await data.AddClassAsync();
        var holds = new[]
        {
            Hold(first.Id, 1, HoldStatus.Held, Past),
            Hold(first.Id, 2, HoldStatus.Held, Now.UtcDateTime), // Exact boundary, not a timing approximation.
            Hold(first.Id, 3, HoldStatus.Held, Future),
            Hold(first.Id, 4, HoldStatus.Confirmed, Past),
            Hold(first.Id, 5, HoldStatus.Cancelled, Past),
            Hold(first.Id, 6, HoldStatus.Expired, Past),
            Hold(second.Id, 1, HoldStatus.Held, Past)
        };
        await data.SeedAsync(holds);
        await using var host = new ExpirationTestHost(data, new ExpirationTestClock(Now));
        // No CreateClient/HTTP call on this host: all observations are independent SQL reads.
        await ExpirationTestHost.EventuallyAsync(async () =>
            (await data.HoldsAsync(first.Id)).Count(row => row.Status == HoldStatus.Expired) == 3 &&
            (await data.HoldsAsync(second.Id)).All(row => row.Status == HoldStatus.Expired));
        var stored = (await data.HoldsAsync(first.Id)).Concat(await data.HoldsAsync(second.Id)).ToDictionary(row => row.Id);
        Assert.Equal(holds.Length, stored.Count);
        foreach (var hold in holds)
            AssertPreserved(hold, stored[hold.Id], hold.Status == HoldStatus.Held && hold.ExpiresAt <= Now.UtcDateTime
                ? HoldStatus.Expired : hold.Status);

        // Only after persistence is proven do we inspect the existing availability API.
        using var read = await data.Client.GetAsync($"/classes/{first.Id}");
        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
        Assert.Equal(new ClassSummaryResponse(first.Id, first.Name, 8, 1, 1, 6),
            await read.Content.ReadFromJsonAsync<ClassSummaryResponse>());
        output.WriteLine("Real hosted worker, zero HTTP requests before verification: 3 HELD rows persisted EXPIRED, including exact UTC boundary; all 7 history rows retained.");
    }

    [PostgresFact]
    public async Task HostedWorker_FutureHoldRemainsHeldUntilControlledUtcExpiry()
    {
        await using var data = await NewDataAsync();
        var admissionClass = await data.AddClassAsync();
        var hold = Hold(admissionClass.Id, 1, HoldStatus.Held, Now.AddSeconds(10).UtcDateTime);
        await data.SeedAsync(hold);
        var clock = new ExpirationTestClock(Now);
        await using var host = new ExpirationTestHost(data, clock);
        await ExpirationTestHost.EventuallyAsync(() => Task.FromResult(host.Logs.ExpiredCounts.Length >= 1));
        AssertPreserved(hold, Assert.Single(await data.HoldsAsync(admissionClass.Id)), HoldStatus.Held);
        clock.SetUtcNow(Now.AddSeconds(10));
        await ExpirationTestHost.EventuallyAsync(async () =>
            (await data.HoldsAsync(admissionClass.Id)).Single().Status == HoldStatus.Expired);
        AssertPreserved(hold, Assert.Single(await data.HoldsAsync(admissionClass.Id)), HoldStatus.Expired);
    }

    [PostgresFact]
    public async Task HostedWorker_RepeatedSweepsAndRestartAreIdempotent()
    {
        await using var data = await NewDataAsync();
        var admissionClass = await data.AddClassAsync();
        var hold = Hold(admissionClass.Id, 1, HoldStatus.Held, Past);
        await data.SeedAsync(hold);
        var clock = new ExpirationTestClock(Now);
        await using var first = new ExpirationTestHost(data, clock);
        await ExpirationTestHost.EventuallyAsync(() => Task.FromResult(first.Logs.ExpiredCounts.Length >= 2));
        Assert.Equal(1, first.Logs.ExpiredCounts[0]);
        Assert.Equal(0, first.Logs.ExpiredCounts[1]);
        await first.Worker.StopAsync(CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(3));
        await using var restarted = new ExpirationTestHost(data, clock, LongPoll);
        await ExpirationTestHost.EventuallyAsync(() => Task.FromResult(restarted.Logs.ExpiredCounts.Length >= 1));
        Assert.Equal(0, restarted.Logs.ExpiredCounts[0]);
        AssertPreserved(hold, Assert.Single(await data.HoldsAsync(admissionClass.Id)), HoldStatus.Expired);
    }

    private static async Task<int> RunSweepAsync(HoldApiTestScope data, TimeProvider clock)
    {
        await using var context = data.CreateContext();
        var result = await new HoldExpirationSweep(context, clock).RunAsync(CancellationToken.None);
        Assert.Empty(context.ChangeTracker.Entries());
        return result;
    }

    [PostgresFact]
    public async Task Sweep_BoundsRowsPerClassAndDrainsBacklogOnLaterCycles()
    {
        await using var data = await NewDataAsync();
        var admissionClass = await data.AddClassAsync();
        var holds = Enumerable.Range(1, HoldExpirationSweep.HoldBatchSize + 2)
            .Select(index => Hold(admissionClass.Id, index, HoldStatus.Held, Past)).ToArray();
        await data.SeedAsync(holds);
        var clock = new ExpirationTestClock(Now);
        Assert.Equal(HoldExpirationSweep.HoldBatchSize, await RunSweepAsync(data, clock));
        Assert.Equal(2, (await data.HoldsAsync(admissionClass.Id)).Count(row => row.Status == HoldStatus.Held));
        Assert.Equal(2, await RunSweepAsync(data, clock));
        Assert.Equal(0, await RunSweepAsync(data, clock));
        Assert.Equal(holds.Length, (await data.HoldsAsync(admissionClass.Id)).Count);
    }

    [PostgresFact]
    public async Task Sweep_BoundsClassCountAndProcessesRemainingClassesLater()
    {
        await using var data = await NewDataAsync();
        var holds = new List<AdmissionHold>();
        for (var index = 0; index < HoldExpirationSweep.ClassBatchSize + 1; index++)
            holds.Add(Hold((await data.AddClassAsync()).Id, 1, HoldStatus.Held, Past));
        await data.SeedAsync(holds.ToArray());
        var clock = new ExpirationTestClock(Now);
        Assert.Equal(HoldExpirationSweep.ClassBatchSize, await RunSweepAsync(data, clock));
        Assert.Equal(1, await RunSweepAsync(data, clock));
        Assert.Equal(0, await RunSweepAsync(data, clock));
    }

    [PostgresTheory]
    [InlineData(HoldStatus.Held)]
    [InlineData(HoldStatus.Confirmed)]
    [InlineData(HoldStatus.Cancelled)]
    [InlineData(HoldStatus.Expired)]
    public async Task Discovery_IsRecheckedAfterTheClassLock(HoldStatus currentStatus)
    {
        await using var data = await NewDataAsync();
        var admissionClass = await data.AddClassAsync();
        var hold = Hold(admissionClass.Id, 1, HoldStatus.Held, Past);
        await data.SeedAsync(hold);
        await using var blocker = data.CreateContext();
        await using var transaction = await blocker.Database.BeginTransactionAsync();
        await blocker.AdmissionClasses.FromSqlInterpolated($"""
            SELECT * FROM "AdmissionClasses" WHERE "Id" = {admissionClass.Id} FOR UPDATE
            """).ToListAsync();
        await using var host = new ExpirationTestHost(data, new ExpirationTestClock(Now), LongPoll);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await data.WaitForBlockedRequestsAsync(1, deadline.Token);
        var changed = await blocker.AdmissionHolds.SingleAsync(row => row.Id == hold.Id, deadline.Token);
        changed.Status = currentStatus;
        if (currentStatus == HoldStatus.Held) changed.ExpiresAt = Future;
        if (currentStatus == HoldStatus.Confirmed) changed.ConfirmedAt = Past;
        if (currentStatus == HoldStatus.Cancelled) changed.CancelledAt = Past;
        await blocker.SaveChangesAsync(deadline.Token);
        await transaction.CommitAsync(deadline.Token);
        await ExpirationTestHost.EventuallyAsync(() => Task.FromResult(host.Logs.ExpiredCounts.Length >= 1));
        Assert.Equal(0, host.Logs.ExpiredCounts[0]);
        AssertPreserved(changed, Assert.Single(await data.HoldsAsync(admissionClass.Id)), currentStatus);
    }

    [PostgresFact]
    public async Task DecisionTime_IsCapturedAfterClassLockWait()
    {
        await using var data = await NewDataAsync();
        var admissionClass = await data.AddClassAsync();
        await data.SeedAsync(Hold(admissionClass.Id, 1, HoldStatus.Held, Past),
            Hold(admissionClass.Id, 2, HoldStatus.Held, Now.AddSeconds(10).UtcDateTime));
        await using var blocker = data.CreateContext();
        await using var transaction = await blocker.Database.BeginTransactionAsync();
        await blocker.AdmissionClasses.FromSqlInterpolated($"""
            SELECT * FROM "AdmissionClasses" WHERE "Id" = {admissionClass.Id} FOR UPDATE
            """).ToListAsync();
        var clock = new ExpirationTestClock(Now);
        await using var host = new ExpirationTestHost(data, clock, LongPoll);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await data.WaitForBlockedRequestsAsync(1, deadline.Token);
        clock.SetUtcNow(Now.AddSeconds(10));
        await transaction.CommitAsync(deadline.Token);
        await ExpirationTestHost.EventuallyAsync(() => Task.FromResult(host.Logs.ExpiredCounts.Length >= 1));
        Assert.Equal(2, host.Logs.ExpiredCounts[0]);
        Assert.All(await data.HoldsAsync(admissionClass.Id), row => Assert.Equal(HoldStatus.Expired, row.Status));
    }

    [PostgresFact]
    public async Task Shutdown_CancelsLongPollingWaitPromptly()
    {
        await using var data = await NewDataAsync();
        await using var host = new ExpirationTestHost(data, new ExpirationTestClock(Now), LongPoll);
        await ExpirationTestHost.EventuallyAsync(() => Task.FromResult(host.Logs.ExpiredCounts.Length >= 1));
        await host.Worker.StopAsync(CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(host.Worker.ExecuteTask!.IsCompleted);
        Assert.DoesNotContain(host.Logs.Entries, entry => entry.Level == LogLevel.Error);
    }

    [PostgresFact]
    public async Task Shutdown_CancelsClassLockWaitWithoutChangingRows()
    {
        await using var data = await NewDataAsync();
        var admissionClass = await data.AddClassAsync(1);
        var hold = Hold(admissionClass.Id, 1, HoldStatus.Held, Past);
        await data.SeedAsync(hold);
        await using var blocker = data.CreateContext();
        await using var transaction = await blocker.Database.BeginTransactionAsync();
        await blocker.AdmissionClasses.FromSqlInterpolated($"""
            SELECT * FROM "AdmissionClasses" WHERE "Id" = {admissionClass.Id} FOR UPDATE
            """).ToListAsync();
        await using var host = new ExpirationTestHost(data, new ExpirationTestClock(Now));
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await data.WaitForBlockedRequestsAsync(1, deadline.Token);
        await host.Worker.StopAsync(CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(host.Worker.ExecuteTask!.IsCompleted);
        await transaction.CommitAsync(deadline.Token);
        AssertPreserved(hold, Assert.Single(await data.HoldsAsync(admissionClass.Id)), HoldStatus.Held);
        Assert.DoesNotContain(host.Logs.Entries, entry => entry.Level == LogLevel.Error);
    }

    [PostgresFact]
    public async Task Shutdown_RollsBackAnExecutedButUncommittedExpirationUpdate()
    {
        await using var data = await NewDataAsync();
        var admissionClass = await data.AddClassAsync();
        var hold = Hold(admissionClass.Id, 1, HoldStatus.Held, Past);
        await data.SeedAsync(hold);
        var gate = new PauseAfterUpdate();
        await using var host = new ExpirationTestHost(data, new ExpirationTestClock(Now), interceptor: gate);
        await gate.Executed.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(HoldStatus.Held, Assert.Single(await data.HoldsAsync(admissionClass.Id)).Status);
        await host.Worker.StopAsync(CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(3));
        Assert.True(host.Worker.ExecuteTask!.IsCompleted);
        AssertPreserved(hold, Assert.Single(await data.HoldsAsync(admissionClass.Id)), HoldStatus.Held);
        Assert.DoesNotContain(host.Logs.Entries, entry => entry.Level == LogLevel.Error);
    }

    [PostgresFact]
    public async Task DatabaseFailure_IsLoggedLivenessSurvivesAndLaterFreshScopeRecovers()
    {
        await using var data = await NewDataAsync();
        var admissionClass = await data.AddClassAsync();
        await data.SeedAsync(Hold(admissionClass.Id, 1, HoldStatus.Held, Past));
        using var context = data.CreateContext();
        var badConnection = new NpgsqlConnectionStringBuilder(context.Database.GetConnectionString()) { Timeout = 1 };
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        badConnection.Port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop(); // Deliberately closed local port, no PostgreSQL/system changes.
        var recorder = new ContextRecorder();
        await using var host = new ExpirationTestHost(data, new ExpirationTestClock(Now), interceptor: recorder,
            connectionOverride: badConnection.ConnectionString);
        await ExpirationTestHost.EventuallyAsync(() => Task.FromResult(host.Logs.Entries.Any(entry => entry.Level == LogLevel.Error)));
        Assert.Equal(HoldStatus.Held, Assert.Single(await data.HoldsAsync(admissionClass.Id)).Status);
        using var client = host.Factory.CreateClient();
        using var health = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
        host.Factory.Services.GetRequiredService<IConfiguration>()["ConnectionStrings:DefaultConnection"] = host.ConnectionString;
        await ExpirationTestHost.EventuallyAsync(async () =>
            (await data.HoldsAsync(admissionClass.Id)).Single().Status == HoldStatus.Expired);
        Assert.True(recorder.ContextIds.Count >= 2);
        Assert.False(host.Worker.ExecuteTask!.IsCompleted);
        output.WriteLine("Actual PostgreSQL connection refusal logged; /health stayed 200; restoring configuration allowed a fresh-scope sweep to persist EXPIRED.");
    }

    private sealed class PauseAfterUpdate : DbCommandInterceptor
    {
        public TaskCompletionSource Executed { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public override async ValueTask<int> NonQueryExecutedAsync(DbCommand command, CommandExecutedEventData eventData,
            int result, CancellationToken cancellationToken = default)
        {
            if (command.CommandText.StartsWith("UPDATE", StringComparison.Ordinal))
            {
                Executed.TrySetResult();
                await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            }
            return result;
        }
    }

    private sealed class ContextRecorder : DbConnectionInterceptor
    {
        public ConcurrentDictionary<Guid, bool> ContextIds { get; } = new();
        public override ValueTask<InterceptionResult> ConnectionOpeningAsync(DbConnection connection, ConnectionEventData eventData,
            InterceptionResult result, CancellationToken cancellationToken = default)
        {
            if (eventData.Context is not null) ContextIds.TryAdd(eventData.Context.ContextId.InstanceId, true);
            return ValueTask.FromResult(result);
        }
    }
}
