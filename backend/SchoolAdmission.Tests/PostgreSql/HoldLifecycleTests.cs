using System.Data.Common;
using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Diagnostics;
using SchoolAdmission.Api.Contracts.Classes;
using SchoolAdmission.Api.Contracts.Holds;
using SchoolAdmission.Api.Domain;

namespace SchoolAdmission.Tests.PostgreSql;

[Collection("Committed PostgreSQL holds")]
[Trait("Category", "PostgreSQL")]
public sealed class HoldLifecycleTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>
{
    private readonly string student = NewStudent();
    private readonly string otherStudent = NewStudent();
    private static readonly DateTime Past = new(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Future = new(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static string NewStudent() => Random.Shared.NextInt64(
        10_000_000_000_000_000, 100_000_000_000_000_000).ToString(CultureInfo.InvariantCulture);

    private AdmissionHold History(Guid classId, HoldStatus status = HoldStatus.Held, bool elapsed = false) => new()
    {
        ClassId = classId, StudentId = student, Status = status,
        CreatedAt = Past.AddDays(-1), ExpiresAt = elapsed ? Past : Future,
        ConfirmedAt = status == HoldStatus.Confirmed ? Past : null,
        CancelledAt = status == HoldStatus.Cancelled ? Past : null
    };

    internal static async Task<HttpResponseMessage> SendAsync(HttpClient client, string operation,
        string holdId, string? studentId, CancellationToken cancellationToken = default)
    {
        using var request = Request(operation, holdId);
        if (studentId is not null)
            request.Headers.TryAddWithoutValidation("X-Student-Id", studentId);
        return await client.SendAsync(request, cancellationToken);
    }

    private static HttpRequestMessage Request(string operation, string holdId) => operation switch
    {
        "get" => new(HttpMethod.Get, $"/holds/{holdId}"),
        "confirm" => new(HttpMethod.Post, $"/holds/{holdId}/confirm"),
        "cancel" => new(HttpMethod.Delete, $"/holds/{holdId}"),
        "history" => new(HttpMethod.Get, "/me/holds"),
        _ => throw new ArgumentOutOfRangeException(nameof(operation))
    };

    private static async Task AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal((int)status, body.GetProperty("status").GetInt32());
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("title").GetString()));
    }

    private static async Task AssertAvailabilityAsync(HoldApiTestScope scope, Guid classId,
        int held, int confirmed, int available)
    {
        using var response = await scope.Client.GetAsync($"/classes/{classId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var summary = (await response.Content.ReadFromJsonAsync<ClassSummaryResponse>())!;
        Assert.Equal(held, summary.HeldSeats);
        Assert.Equal(confirmed, summary.ConfirmedSeats);
        Assert.Equal(available, summary.AvailableSeats);
    }

    [PostgresTheory]
    [InlineData(HoldStatus.Held, false, "HELD")]
    [InlineData(HoldStatus.Held, true, "EXPIRED")]
    [InlineData(HoldStatus.Confirmed, true, "CONFIRMED")]
    [InlineData(HoldStatus.Expired, false, "EXPIRED")]
    [InlineData(HoldStatus.Cancelled, false, "CANCELLED")]
    [InlineData(HoldStatus.Cancelled, true, "CANCELLED")]
    public async Task Get_ReturnsExactPublicContractAndNormalizesOnlyTargetedExpiry(
        HoldStatus status, bool elapsed, string expectedStatus)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync();
        var hold = History(admissionClass.Id, status, elapsed);
        var unrelated = History(admissionClass.Id, elapsed: true);
        unrelated.StudentId = otherStudent;
        await scope.SeedAsync(hold, unrelated);

        // Neither a missing nor an irrelevant malformed header restricts this public GET.
        foreach (var header in new string?[] { null, "not-a-student" })
        {
            using var response = await SendAsync(scope.Client, "get", hold.Id.ToString(), header);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var json = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal(new[] { "classId", "expiresAt", "holdId", "status" },
                json.EnumerateObject().Select(property => property.Name).Order());
            var result = json.Deserialize<HoldResponse>(JsonSerializerOptions.Web)!;
            Assert.Equal(new HoldResponse(hold.Id, admissionClass.Id, expectedStatus, hold.ExpiresAt), result);
        }
        var rows = await scope.HoldsAsync(admissionClass.Id);
        var stored = Assert.Single(rows, row => row.Id == hold.Id);
        Assert.Equal(Enum.Parse<HoldStatus>(expectedStatus, true), stored.Status);
        Assert.Equal(hold.ExpiresAt, stored.ExpiresAt);
        Assert.Equal(hold.ConfirmedAt, stored.ConfirmedAt);
        Assert.Equal(hold.CancelledAt, stored.CancelledAt);
        Assert.Equal(HoldStatus.Held, Assert.Single(rows, row => row.Id == unrelated.Id).Status);
    }

    [PostgresFact]
    public async Task Confirm_CommitsOnceAndRepeatedConfirmationPreservesTimestampsAndCapacity()
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(2);
        using var creation = await scope.PostAsync(admissionClass.Id, student);
        Assert.Equal(HttpStatusCode.Created, creation.StatusCode);
        var created = (await creation.Content.ReadFromJsonAsync<CreatedHoldResponse>())!;
        var original = Assert.Single(await scope.HoldsAsync(admissionClass.Id));

        using var confirmation = await SendAsync(scope.Client, "confirm", created.HoldId.ToString(), student);
        Assert.Equal(HttpStatusCode.OK, confirmation.StatusCode);
        var json = await confirmation.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(new[] { "holdId", "status" }, json.EnumerateObject().Select(property => property.Name).Order());
        Assert.Equal(new ConfirmedHoldResponse(created.HoldId, "CONFIRMED"),
            json.Deserialize<ConfirmedHoldResponse>(JsonSerializerOptions.Web));
        var first = Assert.Single(await scope.HoldsAsync(admissionClass.Id));
        Assert.Equal(HoldStatus.Confirmed, first.Status);
        Assert.NotNull(first.ConfirmedAt);
        Assert.Equal(DateTimeKind.Utc, first.ConfirmedAt.Value.Kind);
        Assert.Null(first.CancelledAt);
        Assert.Equal(original.ExpiresAt, first.ExpiresAt);
        await AssertAvailabilityAsync(scope, admissionClass.Id, 0, 1, 1);

        using var retry = await SendAsync(scope.Client, "confirm", created.HoldId.ToString(), student);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal(new ConfirmedHoldResponse(created.HoldId, "CONFIRMED"),
            await retry.Content.ReadFromJsonAsync<ConfirmedHoldResponse>());
        var repeated = Assert.Single(await scope.HoldsAsync(admissionClass.Id));
        Assert.Equal(first.ConfirmedAt, repeated.ConfirmedAt);
        Assert.Equal(first.ExpiresAt, repeated.ExpiresAt);
        Assert.Equal(first.CreatedAt, repeated.CreatedAt);
        await AssertAvailabilityAsync(scope, admissionClass.Id, 0, 1, 1);
    }

    [PostgresFact]
    public async Task Confirm_AlreadyConfirmedRemainsIdempotentAfterOriginalExpiry()
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var hold = History(admissionClass.Id, HoldStatus.Confirmed, elapsed: true);
        await scope.SeedAsync(hold);
        for (var attempt = 0; attempt < 2; attempt++)
        {
            using var response = await SendAsync(scope.Client, "confirm", hold.Id.ToString(), student);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal(new ConfirmedHoldResponse(hold.Id, "CONFIRMED"),
                await response.Content.ReadFromJsonAsync<ConfirmedHoldResponse>());
        }
        var stored = Assert.Single(await scope.HoldsAsync(admissionClass.Id));
        Assert.Equal(HoldStatus.Confirmed, stored.Status);
        Assert.Equal(hold.ConfirmedAt, stored.ConfirmedAt);
        Assert.Equal(hold.ExpiresAt, stored.ExpiresAt);
        await AssertAvailabilityAsync(scope, admissionClass.Id, 0, 1, 0);
    }

    [PostgresTheory]
    [InlineData(HoldStatus.Held)]
    [InlineData(HoldStatus.Confirmed)]
    public async Task Cancel_ReleasesSeatPreservesHistoryAndIsIdempotent(HoldStatus status)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var hold = History(admissionClass.Id, status, elapsed: status == HoldStatus.Confirmed);
        await scope.SeedAsync(hold);
        await AssertAvailabilityAsync(scope, admissionClass.Id, status == HoldStatus.Held ? 1 : 0,
            status == HoldStatus.Confirmed ? 1 : 0, 0);
        using var cancellation = await SendAsync(scope.Client, "cancel", hold.Id.ToString(), student);
        Assert.Equal(HttpStatusCode.NoContent, cancellation.StatusCode);
        Assert.Empty(await cancellation.Content.ReadAsByteArrayAsync());
        var first = Assert.Single(await scope.HoldsAsync(admissionClass.Id));
        Assert.Equal(HoldStatus.Cancelled, first.Status);
        Assert.NotNull(first.CancelledAt);
        Assert.Equal(DateTimeKind.Utc, first.CancelledAt.Value.Kind);
        Assert.Equal(hold.ConfirmedAt, first.ConfirmedAt);
        Assert.Equal(hold.ExpiresAt, first.ExpiresAt);
        await AssertAvailabilityAsync(scope, admissionClass.Id, 0, 0, 1);

        using var retry = await SendAsync(scope.Client, "cancel", hold.Id.ToString(), student);
        Assert.Equal(HttpStatusCode.NoContent, retry.StatusCode);
        Assert.Empty(await retry.Content.ReadAsByteArrayAsync());
        var repeated = Assert.Single(await scope.HoldsAsync(admissionClass.Id));
        Assert.Equal(first.CancelledAt, repeated.CancelledAt);
        Assert.Equal(first.ConfirmedAt, repeated.ConfirmedAt);

        using var replacement = await scope.PostAsync(admissionClass.Id, otherStudent);
        Assert.Equal(HttpStatusCode.Created, replacement.StatusCode);
        Assert.Equal(2, (await scope.HoldsAsync(admissionClass.Id)).Count);
        await AssertAvailabilityAsync(scope, admissionClass.Id, 1, 0, 0);
    }

    [PostgresTheory]
    [InlineData(HoldStatus.Held)]
    [InlineData(HoldStatus.Expired)]
    [InlineData(HoldStatus.Cancelled)]
    public async Task Confirm_ExpiredOrCancelledReturns409WithoutConfirmation(HoldStatus status)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var hold = History(admissionClass.Id, status, elapsed: true);
        if (status == HoldStatus.Held)
            hold.ExpiresAt = DateTime.UtcNow; // At/past the boundary by the server's later decision.
        await scope.SeedAsync(hold);
        var persistedExpiry = Assert.Single(await scope.HoldsAsync(admissionClass.Id)).ExpiresAt;
        using var response = await SendAsync(scope.Client, "confirm", hold.Id.ToString(), student);
        await AssertProblemAsync(response, HttpStatusCode.Conflict);
        var stored = Assert.Single(await scope.HoldsAsync(admissionClass.Id));
        Assert.Equal(status == HoldStatus.Held ? HoldStatus.Expired : status, stored.Status);
        Assert.Null(stored.ConfirmedAt);
        Assert.Equal(persistedExpiry, stored.ExpiresAt);
        await AssertAvailabilityAsync(scope, admissionClass.Id, 0, 0, 1);
    }

    [PostgresTheory]
    [InlineData(HoldStatus.Held)]
    [InlineData(HoldStatus.Expired)]
    public async Task Cancel_ExpiredReturns409AndNeverRelabelsAsCancelled(HoldStatus status)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var hold = History(admissionClass.Id, status, elapsed: true);
        await scope.SeedAsync(hold);
        using var response = await SendAsync(scope.Client, "cancel", hold.Id.ToString(), student);
        await AssertProblemAsync(response, HttpStatusCode.Conflict);
        var stored = Assert.Single(await scope.HoldsAsync(admissionClass.Id));
        Assert.Equal(HoldStatus.Expired, stored.Status);
        Assert.Null(stored.CancelledAt);
        Assert.Equal(hold.ExpiresAt, stored.ExpiresAt);
        await AssertAvailabilityAsync(scope, admissionClass.Id, 0, 0, 1);
    }

    [PostgresTheory]
    [InlineData("confirm", false)]
    [InlineData("cancel", false)]
    [InlineData("confirm", true)]
    [InlineData("cancel", true)]
    public async Task Writes_WrongOwnerReturns404WithoutMutatingEvenStaleHistory(string operation, bool elapsed)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync();
        var hold = History(admissionClass.Id, elapsed: elapsed);
        await scope.SeedAsync(hold);
        using var response = await SendAsync(scope.Client, operation, hold.Id.ToString(), otherStudent);
        await AssertProblemAsync(response, HttpStatusCode.NotFound);
        var stored = Assert.Single(await scope.HoldsAsync(admissionClass.Id));
        Assert.Equal(HoldStatus.Held, stored.Status);
        Assert.Equal(hold.ExpiresAt, stored.ExpiresAt);
        Assert.Null(stored.ConfirmedAt);
        Assert.Null(stored.CancelledAt);
    }

    public static IEnumerable<object?[]> InvalidHeaderCases()
    {
        foreach (var operation in new[] { "confirm", "cancel", "history" })
        foreach (var value in new[] { null, "", "   ", "1234567890123456", "123456789012345678",
                     "1234567890123456x", "১২৩৪৫৬৭৮৯০১২৩৪৫৬৭", " 01234567890123456", "01234567890123456 ",
                     "01234567890123456,20152691234567890" })
            yield return new object?[] { operation, value };
    }

    [PostgresTheory]
    [MemberData(nameof(InvalidHeaderCases))]
    public async Task ProtectedEndpoints_RejectInvalidHeadersWithoutMutating(string operation, string? header)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync();
        var hold = History(admissionClass.Id);
        await scope.SeedAsync(hold);
        using var response = await SendAsync(scope.Client, operation, hold.Id.ToString(), header);
        await AssertProblemAsync(response, HttpStatusCode.BadRequest);
        Assert.Equal(HoldStatus.Held, Assert.Single(await scope.HoldsAsync(admissionClass.Id)).Status);
    }

    [PostgresTheory]
    [InlineData("confirm")]
    [InlineData("cancel")]
    [InlineData("history")]
    public async Task ProtectedEndpoints_RejectMultipleHeaders(string operation)
    {
        await using var scope = new HoldApiTestScope(fixture);
        using var request = Request(operation, Guid.NewGuid().ToString());
        request.Headers.TryAddWithoutValidation("X-Student-Id", new[] { student, otherStudent });
        using var response = await scope.Client.SendAsync(request);
        await AssertProblemAsync(response, HttpStatusCode.BadRequest);
    }

    [PostgresTheory]
    [InlineData("get", "not-a-guid")]
    [InlineData("confirm", "not-a-guid")]
    [InlineData("cancel", "not-a-guid")]
    [InlineData("get", "h_789")]
    [InlineData("confirm", "h_789")]
    [InlineData("cancel", "h_789")]
    public async Task HoldEndpoints_RejectMalformedUuid(string operation, string id)
    {
        await using var scope = new HoldApiTestScope(fixture);
        using var response = await SendAsync(scope.Client, operation, id, student);
        await AssertProblemAsync(response, HttpStatusCode.BadRequest);
    }

    [PostgresTheory]
    [InlineData("get")]
    [InlineData("confirm")]
    [InlineData("cancel")]
    public async Task HoldEndpoints_UnknownUuidReturns404(string operation)
    {
        await using var scope = new HoldApiTestScope(fixture);
        using var response = await SendAsync(scope.Client, operation, Guid.NewGuid().ToString(), student);
        await AssertProblemAsync(response, HttpStatusCode.NotFound);
    }

    [PostgresTheory]
    [InlineData(HoldStatus.Cancelled, HttpStatusCode.NoContent)]
    [InlineData(HoldStatus.Expired, HttpStatusCode.Conflict)]
    public async Task Cancel_OldUuidNeverCancelsLaterReplacement(HoldStatus oldStatus, HttpStatusCode expected)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var old = History(admissionClass.Id, oldStatus, elapsed: true);
        await scope.SeedAsync(old);
        using var creation = await scope.PostAsync(admissionClass.Id, student);
        Assert.Equal(HttpStatusCode.Created, creation.StatusCode);
        var replacement = (await creation.Content.ReadFromJsonAsync<CreatedHoldResponse>())!;
        using var cancellation = await SendAsync(scope.Client, "cancel", old.Id.ToString(), student);
        Assert.Equal(expected, cancellation.StatusCode);
        var rows = await scope.HoldsAsync(admissionClass.Id);
        Assert.Equal(2, rows.Count);
        Assert.Equal(oldStatus, Assert.Single(rows, row => row.Id == old.Id).Status);
        Assert.Equal(HoldStatus.Held, Assert.Single(rows, row => row.Id == replacement.HoldId).Status);
        await AssertAvailabilityAsync(scope, admissionClass.Id, 1, 0, 0);
    }

    [PostgresFact]
    public async Task MyHolds_ReturnsOnlyOwnHistoryWithEffectiveStatusesStableOrderingAndOneQuery()
    {
        await using var scope = new HoldApiTestScope(fixture);
        var first = await scope.AddClassAsync();
        var second = await scope.AddClassAsync();
        var third = await scope.AddClassAsync();
        var held = History(first.Id);
        var expired = History(first.Id, HoldStatus.Expired, true);
        var cancelled = History(first.Id, HoldStatus.Cancelled, true);
        var confirmed = History(second.Id, HoldStatus.Confirmed, true);
        var stale = History(third.Id, elapsed: true);
        held.CreatedAt = confirmed.CreatedAt = Past.AddDays(3);
        expired.CreatedAt = Past.AddDays(2);
        cancelled.CreatedAt = Past.AddDays(1);
        stale.CreatedAt = Past.AddDays(4);
        var foreign = History(first.Id);
        foreign.StudentId = otherStudent;
        foreign.CreatedAt = Future;
        await scope.SeedAsync(held, expired, cancelled, confirmed, stale, foreign);
        var own = new[] { held, expired, cancelled, confirmed, stale };
        var names = new Dictionary<Guid, string> { [first.Id] = first.Name, [second.Id] = second.Name, [third.Id] = third.Name };
        var expected = own.OrderByDescending(hold => hold.CreatedAt).ThenBy(hold => hold.Id.ToString(), StringComparer.Ordinal)
            .Select(hold => new StudentHoldResponse(hold.Id, hold.ClassId, names[hold.ClassId],
                hold.Id == stale.Id ? "EXPIRED" : hold.Status.ToString().ToUpperInvariant(), hold.ExpiresAt)).ToArray();
        var counter = new ReadCounter();
        var client = scope.CreateIndependentClient(counter);
        for (var iteration = 0; iteration < 2; iteration++)
        {
            counter.Reset();
            using var response = await SendAsync(client, "history", "", student);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var json = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.All(json.EnumerateArray(), item => Assert.Equal(
                new[] { "classId", "className", "expiresAt", "holdId", "status" },
                item.EnumerateObject().Select(property => property.Name).Order()));
            Assert.Equal(expected, json.Deserialize<StudentHoldResponse[]>(JsonSerializerOptions.Web));
            Assert.Equal(1, counter.Count);
        }
        Assert.Equal(HoldStatus.Held, Assert.Single(await scope.HoldsAsync(third.Id)).Status);
    }

    [PostgresFact]
    public async Task MyHolds_UnknownStudentReturnsEmptyArray()
    {
        await using var scope = new HoldApiTestScope(fixture);
        using var response = await SendAsync(scope.Client, "history", "", student);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty((await response.Content.ReadFromJsonAsync<StudentHoldResponse[]>())!);
    }

    private sealed class ReadCounter : DbCommandInterceptor
    {
        private int count;
        public int Count => Volatile.Read(ref count);
        public void Reset() => Interlocked.Exchange(ref count, 0);
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref count);
            return ValueTask.FromResult(result);
        }
    }
}
