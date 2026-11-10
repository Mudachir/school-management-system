using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Configuration;
using SchoolAdmission.Api.Contracts.Classes;
using SchoolAdmission.Api.Domain;
using Xunit.Abstractions;

namespace SchoolAdmission.Tests.PostgreSql;

[Collection("Committed PostgreSQL holds")]
[Trait("Category", "PostgreSQL")]
public sealed class HoldExpirationConcurrencyTests(PostgresFixture fixture, ITestOutputHelper output) : IClassFixture<PostgresFixture>
{
    private static readonly DateTime Past = new(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Future = new(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private static string LongPoll => HoldExpirationOptions.MaximumPollSeconds.ToString(CultureInfo.InvariantCulture);

    private async Task<HoldApiTestScope> NewDataAsync()
    {
        var data = new HoldApiTestScope(fixture);
        try
        {
            await using var context = data.CreateContext();
            Assert.False(await context.AdmissionHolds.AnyAsync(),
                "Expiration concurrency tests require an empty dedicated database; no worker was started.");
            return data;
        }
        catch { await data.DisposeAsync(); throw; }
    }

    private static AdmissionHold Hold(Guid classId, int student, HoldStatus status, DateTime expiresAt) => new()
    {
        ClassId = classId, StudentId = student.ToString("D17", CultureInfo.InvariantCulture), Status = status,
        CreatedAt = Past.AddDays(-1), ExpiresAt = expiresAt,
        ConfirmedAt = status == HoldStatus.Confirmed ? Past : null
    };

    [PostgresFact]
    public async Task TwoLiveWorkers_SerializeAndExpireHistoryExactlyOnceWithoutHttp()
    {
        await using var data = await NewDataAsync();
        var admissionClass = await data.AddClassAsync();
        var holds = Enumerable.Range(1, 12).Select(index => Hold(admissionClass.Id, index, HoldStatus.Held, Past)).ToArray();
        await data.SeedAsync(holds);
        await using var blocker = data.CreateContext();
        await using var transaction = await blocker.Database.BeginTransactionAsync();
        await blocker.AdmissionClasses.FromSqlInterpolated($"""
            SELECT * FROM "AdmissionClasses" WHERE "Id" = {admissionClass.Id} FOR UPDATE
            """).ToListAsync();
        await using var first = new ExpirationTestHost(data, TimeProvider.System, LongPoll);
        await using var second = new ExpirationTestHost(data, TimeProvider.System, LongPoll);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        Assert.Equal(2, await data.WaitForBlockedRequestsAsync(2, deadline.Token));
        await transaction.CommitAsync(deadline.Token);
        await ExpirationTestHost.EventuallyAsync(() => Task.FromResult(
            first.Logs.ExpiredCounts.Length >= 1 && second.Logs.ExpiredCounts.Length >= 1));
        Assert.Equal(12, first.Logs.ExpiredCounts[0] + second.Logs.ExpiredCounts[0]);
        var stored = await data.HoldsAsync(admissionClass.Id);
        Assert.Equal(12, stored.Count);
        foreach (var hold in holds)
        {
            var row = Assert.Single(stored, row => row.Id == hold.Id);
            Assert.Equal(HoldStatus.Expired, row.Status);
            Assert.Equal(hold.ExpiresAt, row.ExpiresAt);
            Assert.Equal(hold.CreatedAt, row.CreatedAt);
        }
        output.WriteLine("Two live hosted workers observed waiting on PostgreSQL; zero HTTP calls; 12 expired exactly once, all history retained.");
    }

    [PostgresTheory]
    [InlineData(1)]
    [InlineData(2)]
    public async Task LiveWorkers_WithSimultaneousReservationConfirmationAndCancellation_PreserveCapacity(int workerCount)
    {
        await using var data = await NewDataAsync();
        var admissionClass = await data.AddClassAsync(2);
        var stale = Hold(admissionClass.Id, 1, HoldStatus.Held, Past);
        var toConfirm = Hold(admissionClass.Id, 2, HoldStatus.Held, Future);
        var toCancel = Hold(admissionClass.Id, 3, HoldStatus.Confirmed, Past);
        await data.SeedAsync(stale, toConfirm, toCancel);
        await using var blocker = data.CreateContext();
        await using var transaction = await blocker.Database.BeginTransactionAsync();
        await blocker.AdmissionClasses.FromSqlInterpolated($"""
            SELECT * FROM "AdmissionClasses" WHERE "Id" = {admissionClass.Id} FOR UPDATE
            """).ToListAsync();
        var workers = new List<ExpirationTestHost>();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(40));
        var requests = Array.Empty<Task<HttpResponseMessage>>();
        HttpResponseMessage[] responses = [];
        var released = false;
        try
        {
            for (var index = 0; index < workerCount; index++)
                workers.Add(new ExpirationTestHost(data, TimeProvider.System, LongPoll));
            var secondApi = data.CreateIndependentClient();
            var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var operations = new List<Func<CancellationToken, Task<HttpResponseMessage>>>
            {
                token => HoldLifecycleTests.SendAsync(data.Client, "confirm", toConfirm.Id.ToString(), toConfirm.StudentId, token),
                token => HoldLifecycleTests.SendAsync(secondApi, "cancel", toCancel.Id.ToString(), toCancel.StudentId, token)
            };
            operations.AddRange(Enumerable.Range(20, 8).Select(index =>
                (Func<CancellationToken, Task<HttpResponseMessage>>)(token => data.PostAsync(admissionClass.Id,
                    index.ToString("D17", CultureInfo.InvariantCulture), index % 2 == 0 ? data.Client : secondApi, token))));
            var readyCount = 0;
            requests = operations.Select(async operation =>
            {
                if (Interlocked.Increment(ref readyCount) == operations.Count) ready.SetResult();
                await start.Task.WaitAsync(deadline.Token);
                return await operation(deadline.Token);
            }).ToArray();
            await ready.Task.WaitAsync(deadline.Token);
            start.SetResult();
            Assert.Equal(workerCount + operations.Count,
                await data.WaitForBlockedRequestsAsync(workerCount + operations.Count, deadline.Token));
            await transaction.CommitAsync(deadline.Token);
            released = true;
            responses = await Task.WhenAll(requests).WaitAsync(deadline.Token);
            await ExpirationTestHost.EventuallyAsync(() => Task.FromResult(workers.All(worker => worker.Logs.ExpiredCounts.Length >= 1)));
            Assert.Equal(1, workers.Sum(worker => worker.Logs.ExpiredCounts[0]));
            Assert.Equal(HttpStatusCode.OK, responses[0].StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, responses[1].StatusCode);
            var created = responses.Skip(2).Count(response => response.StatusCode == HttpStatusCode.Created);
            var conflicts = responses.Skip(2).Count(response => response.StatusCode == HttpStatusCode.Conflict);
            Assert.InRange(created, 0, 1);
            Assert.Equal(8 - created, conflicts);
            var rows = await data.HoldsAsync(admissionClass.Id);
            Assert.Equal(3 + created, rows.Count);
            var expired = Assert.Single(rows, row => row.Id == stale.Id);
            Assert.Equal(HoldStatus.Expired, expired.Status);
            Assert.Equal(stale.ExpiresAt, expired.ExpiresAt);
            var confirmed = Assert.Single(rows, row => row.Id == toConfirm.Id);
            Assert.Equal(HoldStatus.Confirmed, confirmed.Status);
            Assert.NotNull(confirmed.ConfirmedAt);
            Assert.Equal(toConfirm.ExpiresAt, confirmed.ExpiresAt);
            var cancelled = Assert.Single(rows, row => row.Id == toCancel.Id);
            Assert.Equal(HoldStatus.Cancelled, cancelled.Status);
            Assert.Equal(toCancel.ConfirmedAt, cancelled.ConfirmedAt);
            Assert.NotNull(cancelled.CancelledAt);
            var now = DateTime.UtcNow;
            Assert.Equal(1 + created, rows.Count(row => row.Status == HoldStatus.Confirmed ||
                row.Status == HoldStatus.Held && row.ExpiresAt > now));
            using var read = await data.Client.GetAsync($"/classes/{admissionClass.Id}");
            Assert.Equal(HttpStatusCode.OK, read.StatusCode);
            Assert.Equal(new ClassSummaryResponse(admissionClass.Id, admissionClass.Name, 2, created, 1, 1 - created),
                await read.Content.ReadFromJsonAsync<ClassSummaryResponse>());
            output.WriteLine($"{workerCount} live worker(s) + 10 simultaneous HTTP operations observed waiting in PostgreSQL: " +
                $"1 expiration, confirm OK, cancel NoContent, reservations {created} Created/{conflicts} Conflict; committed occupancy {1 + created}/2.");
        }
        finally
        {
            await deadline.CancelAsync();
            if (!released) await transaction.RollbackAsync();
            foreach (var response in responses) response.Dispose();
            foreach (var worker in workers) await worker.DisposeAsync();
            try
            {
                if (responses.Length == 0)
                    foreach (var response in await Task.WhenAll(requests)) response.Dispose();
            }
            catch { /* Cancelled pending requests must not hide an earlier assertion. */ }
        }
    }
}
