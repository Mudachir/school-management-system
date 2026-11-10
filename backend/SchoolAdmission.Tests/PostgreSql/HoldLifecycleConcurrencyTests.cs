using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Contracts.Classes;
using SchoolAdmission.Api.Contracts.Holds;
using SchoolAdmission.Api.Domain;
using Xunit.Abstractions;

namespace SchoolAdmission.Tests.PostgreSql;

[Collection("Committed PostgreSQL holds")]
[Trait("Category", "PostgreSQL")]
public sealed class HoldLifecycleConcurrencyTests(PostgresFixture fixture, ITestOutputHelper output) : IClassFixture<PostgresFixture>
{
    private const string Student = "01234567890123456";
    private static readonly DateTime Past = new(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Future = new(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private delegate Task<HttpResponseMessage> Operation(HttpClient client, CancellationToken token);

    private static AdmissionHold History(Guid classId, HoldStatus status = HoldStatus.Held, bool elapsed = false) => new()
    {
        ClassId = classId, StudentId = Student, Status = status,
        CreatedAt = Past.AddDays(-1), ExpiresAt = elapsed ? Past : Future,
        ConfirmedAt = status == HoldStatus.Confirmed ? Past : null
    };

    private static Task<HttpResponseMessage> SendAsync(HttpClient client, string operation, Guid id, CancellationToken token) =>
        HoldLifecycleTests.SendAsync(client, operation, id.ToString(), Student, token);

    private static async Task<HttpResponseMessage[]> RaceAsync(HoldApiTestScope scope, Guid classId, Operation[] operations)
    {
        var secondHost = scope.CreateIndependentClient();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(40));
        await using var blocker = scope.CreateContext();
        await using var transaction = await blocker.Database.BeginTransactionAsync(deadline.Token);
        await blocker.AdmissionClasses.FromSqlInterpolated($"""
            SELECT * FROM "AdmissionClasses" WHERE "Id" = {classId} FOR UPDATE
            """).ToListAsync(deadline.Token);

        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var readyCount = 0;
        var requests = operations.Select(async (operation, index) =>
        {
            if (Interlocked.Increment(ref readyCount) == operations.Length)
                ready.SetResult();
            await start.Task.WaitAsync(deadline.Token);
            return await operation(index % 2 == 0 ? scope.Client : secondHost, deadline.Token);
        }).ToArray();
        var released = false;
        try
        {
            await ready.Task.WaitAsync(deadline.Token);
            start.SetResult();
            Assert.Equal(operations.Length, await scope.WaitForBlockedRequestsAsync(operations.Length, deadline.Token));
            await transaction.CommitAsync(deadline.Token);
            released = true;
            return await Task.WhenAll(requests).WaitAsync(deadline.Token);
        }
        catch
        {
            start.TrySetResult();
            await deadline.CancelAsync();
            if (!released)
                await transaction.RollbackAsync();
            try { foreach (var response in await Task.WhenAll(requests)) response.Dispose(); }
            catch { /* Preserve the original failure after cancelling pending requests. */ }
            throw;
        }
    }

    private static async Task<List<AdmissionHold>> AssertCapacityAsync(HoldApiTestScope scope, Guid classId, int seats)
    {
        var rows = await scope.HoldsAsync(classId); // Independent committed-state read.
        var now = DateTime.UtcNow;
        var held = rows.Count(row => row.Status == HoldStatus.Held && row.ExpiresAt > now);
        var confirmed = rows.Count(row => row.Status == HoldStatus.Confirmed);
        Assert.InRange(held + confirmed, 0, seats);
        using var read = await scope.Client.GetAsync($"/classes/{classId}");
        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
        var summary = (await read.Content.ReadFromJsonAsync<ClassSummaryResponse>())!;
        Assert.Equal(held, summary.HeldSeats);
        Assert.Equal(confirmed, summary.ConfirmedSeats);
        Assert.Equal(seats - held - confirmed, summary.AvailableSeats);
        return rows;
    }

    [PostgresFact]
    public async Task ConcurrentConfirmations_AllReturn200AndCommitExactlyOneConfirmation()
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var hold = History(admissionClass.Id);
        await scope.SeedAsync(hold);
        var responses = await RaceAsync(scope, admissionClass.Id, Enumerable.Range(0, 20)
            .Select(_ => (Operation)((client, token) => SendAsync(client, "confirm", hold.Id, token))).ToArray());
        try
        {
            foreach (var response in responses)
            {
                Assert.Equal(HttpStatusCode.OK, response.StatusCode);
                Assert.Equal(new ConfirmedHoldResponse(hold.Id, "CONFIRMED"),
                    await response.Content.ReadFromJsonAsync<ConfirmedHoldResponse>());
            }
            var row = Assert.Single(await AssertCapacityAsync(scope, admissionClass.Id, 1));
            Assert.Equal(HoldStatus.Confirmed, row.Status);
            Assert.NotNull(row.ConfirmedAt);
            Assert.Equal(hold.ExpiresAt, row.ExpiresAt);
            output.WriteLine("20 simultaneous confirmations across two hosts: 20 OK; one committed CONFIRMED record and occupied seat.");
        }
        finally { foreach (var response in responses) response.Dispose(); }
    }

    [PostgresTheory]
    [InlineData(HoldStatus.Held)]
    [InlineData(HoldStatus.Confirmed)]
    public async Task ConcurrentCancellations_AllReturn204AndReleaseExactlyOneSeat(HoldStatus status)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var hold = History(admissionClass.Id, status, elapsed: status == HoldStatus.Confirmed);
        await scope.SeedAsync(hold);
        var responses = await RaceAsync(scope, admissionClass.Id, Enumerable.Range(0, 20)
            .Select(_ => (Operation)((client, token) => SendAsync(client, "cancel", hold.Id, token))).ToArray());
        try
        {
            foreach (var response in responses)
            {
                Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
                Assert.Empty(await response.Content.ReadAsByteArrayAsync());
            }
            var row = Assert.Single(await AssertCapacityAsync(scope, admissionClass.Id, 1));
            Assert.Equal(HoldStatus.Cancelled, row.Status);
            Assert.NotNull(row.CancelledAt);
            Assert.Equal(hold.ConfirmedAt, row.ConfirmedAt);
            Assert.Equal(hold.ExpiresAt, row.ExpiresAt);
            output.WriteLine($"20 simultaneous cancellations of {status}: 20 NoContent; one retained CANCELLED record; occupancy 0/1.");
        }
        finally { foreach (var response in responses) response.Dispose(); }
    }

    [PostgresFact]
    public async Task ConcurrentConfirmAndCancel_EndCancelledWithoutResurrectionOrDoubleCounting()
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var hold = History(admissionClass.Id);
        await scope.SeedAsync(hold);
        var responses = await RaceAsync(scope, admissionClass.Id,
        [
            (client, token) => SendAsync(client, "confirm", hold.Id, token),
            (client, token) => SendAsync(client, "cancel", hold.Id, token)
        ]);
        try
        {
            Assert.Contains(responses[0].StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict });
            Assert.Equal(HttpStatusCode.NoContent, responses[1].StatusCode);
            var row = Assert.Single(await AssertCapacityAsync(scope, admissionClass.Id, 1));
            Assert.Equal(HoldStatus.Cancelled, row.Status);
            Assert.NotNull(row.CancelledAt);
            Assert.Equal(responses[0].StatusCode == HttpStatusCode.OK, row.ConfirmedAt.HasValue);
            using var late = await SendAsync(scope.Client, "confirm", hold.Id, CancellationToken.None);
            Assert.Equal(HttpStatusCode.Conflict, late.StatusCode);
            output.WriteLine($"Simultaneous confirm/cancel: confirm {responses[0].StatusCode}, cancel NoContent; final CANCELLED; occupancy 0/1.");
        }
        finally { foreach (var response in responses) response.Dispose(); }
    }

    [PostgresTheory]
    [InlineData(HoldStatus.Held)]
    [InlineData(HoldStatus.Confirmed)]
    public async Task ConcurrentCancellationAndReservations_PreserveCapacityAndCommittedHistory(HoldStatus status)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var hold = History(admissionClass.Id, status, elapsed: status == HoldStatus.Confirmed);
        await scope.SeedAsync(hold);
        var operations = new List<Operation> { (client, token) => SendAsync(client, "cancel", hold.Id, token) };
        operations.AddRange(Enumerable.Range(1, 12).Select(index => (Operation)((client, token) =>
            scope.PostAsync(admissionClass.Id, index.ToString("D17", CultureInfo.InvariantCulture), client, token))));
        var responses = await RaceAsync(scope, admissionClass.Id, operations.ToArray());
        try
        {
            Assert.Equal(HttpStatusCode.NoContent, responses[0].StatusCode);
            var created = responses.Skip(1).Count(response => response.StatusCode == HttpStatusCode.Created);
            var conflicts = responses.Skip(1).Count(response => response.StatusCode == HttpStatusCode.Conflict);
            Assert.InRange(created, 0, 1); // All reservations may legally precede cancellation.
            Assert.Equal(12 - created, conflicts);
            var rows = await AssertCapacityAsync(scope, admissionClass.Id, 1);
            Assert.Equal(1 + created, rows.Count);
            Assert.Equal(HoldStatus.Cancelled, Assert.Single(rows, row => row.Id == hold.Id).Status);
            Assert.Equal(created, rows.Count(row => row.Status == HoldStatus.Held));
            if (created == 0)
            {
                using var retry = await scope.PostAsync(admissionClass.Id, "11111111111111111");
                Assert.Equal(HttpStatusCode.Created, retry.StatusCode);
            }
            rows = await AssertCapacityAsync(scope, admissionClass.Id, 1);
            Assert.Equal(2, rows.Count);
            Assert.Single(rows, row => row.Status == HoldStatus.Held);
            output.WriteLine($"Simultaneous cancellation of {status} + 12 reservations: cancel NoContent; " +
                $"{created} Created, {conflicts} Conflict; final occupancy 1/1 after retry if required; old history retained.");
        }
        finally { foreach (var response in responses) response.Dispose(); }
    }

    [PostgresFact]
    public async Task ConcurrentLateConfirmationAndReapplications_ExpireOldHoldAndCreateOneReplacement()
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var hold = History(admissionClass.Id, elapsed: true);
        await scope.SeedAsync(hold);
        var operations = new List<Operation> { (client, token) => SendAsync(client, "confirm", hold.Id, token) };
        operations.AddRange(Enumerable.Range(0, 8).Select(_ => (Operation)((client, token) =>
            scope.PostAsync(admissionClass.Id, Student, client, token))));
        var responses = await RaceAsync(scope, admissionClass.Id, operations.ToArray());
        try
        {
            Assert.Equal(HttpStatusCode.Conflict, responses[0].StatusCode);
            Assert.Single(responses.Skip(1), response => response.StatusCode == HttpStatusCode.Created);
            Assert.Equal(7, responses.Skip(1).Count(response => response.StatusCode == HttpStatusCode.Conflict));
            var rows = await AssertCapacityAsync(scope, admissionClass.Id, 1);
            Assert.Equal(2, rows.Count);
            var old = Assert.Single(rows, row => row.Id == hold.Id);
            Assert.Equal(HoldStatus.Expired, old.Status);
            Assert.Null(old.ConfirmedAt);
            Assert.Single(rows, row => row.Status == HoldStatus.Held);
            output.WriteLine("Simultaneous late confirm + 8 same-student reapplications: confirm Conflict; 1 Created, 7 Conflict; old EXPIRED, replacement HELD; occupancy 1/1.");
        }
        finally { foreach (var response in responses) response.Dispose(); }
    }

    [PostgresFact]
    public async Task ConcurrentPublicGetAndLateConfirmation_NeverConfirmElapsedHold()
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var hold = History(admissionClass.Id, elapsed: true);
        await scope.SeedAsync(hold);
        var responses = await RaceAsync(scope, admissionClass.Id,
        [
            (client, token) => SendAsync(client, "get", hold.Id, token),
            (client, token) => SendAsync(client, "confirm", hold.Id, token)
        ]);
        try
        {
            Assert.Equal(HttpStatusCode.OK, responses[0].StatusCode);
            Assert.Equal("EXPIRED", (await responses[0].Content.ReadFromJsonAsync<HoldResponse>())!.Status);
            Assert.Equal(HttpStatusCode.Conflict, responses[1].StatusCode);
            var row = Assert.Single(await AssertCapacityAsync(scope, admissionClass.Id, 1));
            Assert.Equal(HoldStatus.Expired, row.Status);
            Assert.Null(row.ConfirmedAt);
        }
        finally { foreach (var response in responses) response.Dispose(); }
    }

    [PostgresTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Confirmation_WaitingForClassLockRereadsStateAndDecidesAfterTheWait(bool cancelled)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var hold = History(admissionClass.Id);
        await scope.SeedAsync(hold);
        await using var blocker = scope.CreateContext();
        await using var transaction = await blocker.Database.BeginTransactionAsync();
        await blocker.AdmissionClasses.FromSqlInterpolated($"""
            SELECT * FROM "AdmissionClasses" WHERE "Id" = {admissionClass.Id} FOR UPDATE
            """).ToListAsync();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var request = SendAsync(scope.Client, "confirm", hold.Id, deadline.Token);
        await scope.WaitForBlockedRequestsAsync(1, deadline.Token);
        var current = await blocker.AdmissionHolds.SingleAsync(row => row.Id == hold.Id, deadline.Token);
        if (cancelled)
        {
            current.Status = HoldStatus.Cancelled;
            current.CancelledAt = DateTime.UtcNow;
        }
        else
        {
            // This timestamp is AFTER the waiting request started, but BEFORE its lock acquisition.
            current.ExpiresAt = DateTime.UtcNow;
        }
        await blocker.SaveChangesAsync(deadline.Token);
        await transaction.CommitAsync(deadline.Token);
        using var response = await request.WaitAsync(deadline.Token);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var stored = Assert.Single(await AssertCapacityAsync(scope, admissionClass.Id, 1));
        Assert.Equal(cancelled ? HoldStatus.Cancelled : HoldStatus.Expired, stored.Status);
        Assert.Null(stored.ConfirmedAt);
        output.WriteLine($"Waiting confirmation reread the committed {(cancelled ? "cancellation" : "expiry boundary")}: Conflict; no confirmation and occupancy 0/1.");
    }
}
