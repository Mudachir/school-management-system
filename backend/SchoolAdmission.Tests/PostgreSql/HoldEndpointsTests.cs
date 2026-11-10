using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Contracts.Classes;
using SchoolAdmission.Api.Contracts.Holds;
using SchoolAdmission.Api.Domain;
using Xunit.Abstractions;

namespace SchoolAdmission.Tests.PostgreSql;

[Collection("Committed PostgreSQL holds")]
[Trait("Category", "PostgreSQL")]
public sealed class HoldEndpointsTests(PostgresFixture fixture, ITestOutputHelper output) : IClassFixture<PostgresFixture>
{
    private const string Student = "01234567890123456";
    private const string OtherStudent = "20152691234567890";
    private static readonly DateTime Past = new(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Future = new(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static AdmissionHold History(Guid classId, HoldStatus status, DateTime expiresAt, string student = Student) => new()
    {
        ClassId = classId, StudentId = student, Status = status,
        CreatedAt = Past.AddDays(-1), ExpiresAt = expiresAt,
        ConfirmedAt = status == HoldStatus.Confirmed ? Past : null,
        CancelledAt = status == HoldStatus.Cancelled ? Past : null
    };

    private static async Task AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal((int)status, problem.GetProperty("status").GetInt32());
        Assert.False(string.IsNullOrWhiteSpace(problem.GetProperty("title").GetString()));
    }

    [PostgresTheory]
    [InlineData(null, 600)]
    [InlineData(75, 75)]
    public async Task Create_CommitsHoldWithUtcExpiryConfiguredDurationAndAvailability(int? configuredDuration, int expectedDuration)
    {
        await using var scope = new HoldApiTestScope(fixture, configuredDuration);
        var admissionClass = await scope.AddClassAsync(2);
        var before = DateTime.UtcNow;
        using var response = await scope.PostAsync(admissionClass.Id, Student);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(5, json.EnumerateObject().Count());
        Assert.Equal(JsonValueKind.String, json.GetProperty("holdId").ValueKind);
        Assert.Equal(JsonValueKind.String, json.GetProperty("classId").ValueKind);
        Assert.EndsWith("Z", json.GetProperty("expiresAt").GetString());
        var created = json.Deserialize<CreatedHoldResponse>(JsonSerializerOptions.Web)!;
        Assert.NotEqual(Guid.Empty, created.HoldId);
        Assert.Equal(admissionClass.Id, created.ClassId);
        Assert.Equal(Student, created.StudentId); // The leading zero survives HTTP and PostgreSQL.
        Assert.Equal("HELD", created.Status);
        Assert.Equal(DateTimeKind.Utc, created.ExpiresAt.Kind);
        Assert.InRange(created.ExpiresAt, before.AddSeconds(expectedDuration), DateTime.UtcNow.AddSeconds(expectedDuration));

        // A fresh, independent connection can see the row immediately after 201.
        var stored = Assert.Single(await scope.HoldsAsync(admissionClass.Id));
        Assert.Equal(created.HoldId, stored.Id);
        Assert.Equal(created.ClassId, stored.ClassId);
        Assert.Equal(created.StudentId, stored.StudentId);
        Assert.Equal(HoldStatus.Held, stored.Status);
        Assert.Equal(expectedDuration, (stored.ExpiresAt - stored.CreatedAt).TotalSeconds);
        Assert.InRange((stored.ExpiresAt - created.ExpiresAt).Duration(), TimeSpan.Zero, TimeSpan.FromMicroseconds(1));
        using var read = await scope.Client.GetAsync($"/classes/{admissionClass.Id}");
        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
        Assert.Equal(new ClassSummaryResponse(admissionClass.Id, admissionClass.Name, 2, 1, 0, 1),
            await read.Content.ReadFromJsonAsync<ClassSummaryResponse>());
    }

    [PostgresTheory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("1234567890123456")]
    [InlineData("123456789012345678")]
    [InlineData("1234567890123456x")]
    [InlineData("১২৩৪৫৬৭৮৯০১২৩৪৫৬৭")]
    [InlineData(" 01234567890123456")]
    [InlineData("01234567890123456 ")]
    [InlineData("01234567890123456,20152691234567890")]
    public async Task Create_InvalidStudentHeaderReturns400WithoutWriting(string? studentId)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync();
        using var response = await scope.PostAsync(admissionClass.Id, studentId);
        await AssertProblemAsync(response, HttpStatusCode.BadRequest);
        Assert.Empty(await scope.HoldsAsync(admissionClass.Id));
    }

    [PostgresFact]
    public async Task Create_MultipleStudentHeadersReturn400()
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync();
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/classes/{admissionClass.Id}/holds");
        request.Headers.TryAddWithoutValidation("X-Student-Id", new[] { Student, OtherStudent });
        using var response = await scope.Client.SendAsync(request);
        await AssertProblemAsync(response, HttpStatusCode.BadRequest);
        Assert.Empty(await scope.HoldsAsync(admissionClass.Id));
    }

    [PostgresTheory]
    [InlineData("not-a-guid")]
    [InlineData("c_123")]
    public async Task Create_MalformedClassIdReturns400(string id)
    {
        await using var scope = new HoldApiTestScope(fixture);
        using var response = await scope.PostAsync(id, Student);
        await AssertProblemAsync(response, HttpStatusCode.BadRequest);
    }

    [PostgresFact]
    public async Task Create_MissingClassReturns404WithoutWriting()
    {
        await using var scope = new HoldApiTestScope(fixture);
        var unknown = Guid.NewGuid();
        using var response = await scope.PostAsync(unknown, Student);
        await AssertProblemAsync(response, HttpStatusCode.NotFound);
        Assert.Empty(await scope.HoldsAsync(unknown));
    }

    [PostgresTheory]
    [InlineData(HoldStatus.Held)]
    [InlineData(HoldStatus.Confirmed)]
    public async Task Create_FullClassReturns409WithoutAdditionalHold(HoldStatus status)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var original = History(admissionClass.Id, status, status == HoldStatus.Held ? Future : Past);
        await scope.SeedAsync(original);
        using var response = await scope.PostAsync(admissionClass.Id, OtherStudent);
        await AssertProblemAsync(response, HttpStatusCode.Conflict);
        Assert.Equal(original.Id, Assert.Single(await scope.HoldsAsync(admissionClass.Id)).Id);
    }

    [PostgresTheory]
    [InlineData(HoldStatus.Held)]
    [InlineData(HoldStatus.Confirmed)]
    public async Task Create_DuplicateActiveApplicationReturns409WithoutExtendingOrOverwriting(HoldStatus status)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync();
        var original = History(admissionClass.Id, status, status == HoldStatus.Held ? Future : Past);
        await scope.SeedAsync(original);
        using var response = await scope.PostAsync(admissionClass.Id, Student);
        await AssertProblemAsync(response, HttpStatusCode.Conflict);
        var stored = Assert.Single(await scope.HoldsAsync(admissionClass.Id));
        Assert.Equal(original.Id, stored.Id);
        Assert.Equal(original.Status, stored.Status);
        Assert.Equal(original.ExpiresAt, stored.ExpiresAt);
        Assert.Equal(original.ConfirmedAt, stored.ConfirmedAt);
    }

    [PostgresFact]
    public async Task Create_ElapsedSameStudentHoldBecomesExpiredAndHistoryIsPreserved()
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var original = History(admissionClass.Id, HoldStatus.Held, Past);
        await scope.SeedAsync(original);
        using var response = await scope.PostAsync(admissionClass.Id, Student);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<CreatedHoldResponse>())!;
        var rows = await scope.HoldsAsync(admissionClass.Id);
        Assert.Equal(2, rows.Count);
        var old = Assert.Single(rows, row => row.Id == original.Id);
        Assert.Equal(HoldStatus.Expired, old.Status);
        Assert.Equal(original.CreatedAt, old.CreatedAt);
        Assert.Equal(original.ExpiresAt, old.ExpiresAt);
        Assert.Equal(created.HoldId, Assert.Single(rows, row => row.Status == HoldStatus.Held).Id);
    }

    [PostgresTheory]
    [InlineData(HoldStatus.Expired)]
    [InlineData(HoldStatus.Cancelled)]
    public async Task Create_InactiveHistoryPermitsReapplicationWithoutChangingHistory(HoldStatus status)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var original = History(admissionClass.Id, status, Future);
        await scope.SeedAsync(original);
        using var response = await scope.PostAsync(admissionClass.Id, Student);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var rows = await scope.HoldsAsync(admissionClass.Id);
        Assert.Equal(2, rows.Count);
        var old = Assert.Single(rows, row => row.Id == original.Id);
        Assert.Equal(status, old.Status);
        Assert.Equal(original.ExpiresAt, old.ExpiresAt);
        Assert.Equal(original.CancelledAt, old.CancelledAt);
        Assert.Single(rows, row => row.Status == HoldStatus.Held);
    }

    [PostgresFact]
    public async Task Create_OtherStudentsStaleHoldDoesNotConsumeCapacityOrChangeStatus()
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var original = History(admissionClass.Id, HoldStatus.Held, Past);
        await scope.SeedAsync(original);
        using var response = await scope.PostAsync(admissionClass.Id, OtherStudent);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var rows = await scope.HoldsAsync(admissionClass.Id);
        Assert.Equal(2, rows.Count);
        Assert.Equal(HoldStatus.Held, Assert.Single(rows, row => row.Id == original.Id).Status);
        Assert.Single(rows, row => row.Status == HoldStatus.Held && row.ExpiresAt > DateTime.UtcNow);
    }

    [PostgresFact]
    public async Task Create_FullClassRollsBackRequestTimeExpiryNormalization()
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(1);
        var stale = History(admissionClass.Id, HoldStatus.Held, Past);
        var confirmed = History(admissionClass.Id, HoldStatus.Confirmed, Past, OtherStudent);
        await scope.SeedAsync(stale, confirmed);
        using var response = await scope.PostAsync(admissionClass.Id, Student);
        await AssertProblemAsync(response, HttpStatusCode.Conflict);
        var rows = await scope.HoldsAsync(admissionClass.Id);
        Assert.Equal(2, rows.Count);
        Assert.Equal(HoldStatus.Held, Assert.Single(rows, row => row.Id == stale.Id).Status);
        Assert.Equal(HoldStatus.Confirmed, Assert.Single(rows, row => row.Id == confirmed.Id).Status);
    }

    // All clients first reach a start barrier, then all HTTP requests are observed
    // waiting on a real PostgreSQL lock before the blocker is committed.
    private static async Task<(HttpResponseMessage[] Responses, int Blocked)> ContendAsync(
        HoldApiTestScope scope, Guid classId, string[] students)
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
        var requests = students.Select(async (student, index) =>
        {
            if (Interlocked.Increment(ref readyCount) == students.Length)
                ready.SetResult();
            await start.Task.WaitAsync(deadline.Token);
            return await scope.PostAsync(classId, student, index % 2 == 0 ? scope.Client : secondHost, deadline.Token);
        }).ToArray();
        var released = false;
        try
        {
            await ready.Task.WaitAsync(deadline.Token);
            start.SetResult();
            var blocked = await scope.WaitForBlockedRequestsAsync(students.Length, deadline.Token);
            await transaction.CommitAsync(deadline.Token);
            released = true;
            return (await Task.WhenAll(requests).WaitAsync(deadline.Token), blocked);
        }
        catch
        {
            start.TrySetResult();
            await deadline.CancelAsync();
            if (!released)
                await transaction.RollbackAsync();
            try
            {
                foreach (var response in await Task.WhenAll(requests))
                    response.Dispose();
            }
            catch { /* Preserve the original failure; all requests were cancelled. */ }
            throw;
        }
    }

    [PostgresTheory]
    [InlineData(1, 24, 0)]
    [InlineData(5, 40, 0)]
    [InlineData(5, 24, 2)]
    public async Task ConcurrentDistinctStudents_NeverExceedCommittedCapacity(int seats, int requests, int confirmedSeats)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(seats);
        for (var index = 0; index < confirmedSeats; index++)
            await scope.SeedAsync(History(admissionClass.Id, HoldStatus.Confirmed, Past,
                (900 + index).ToString("D17", CultureInfo.InvariantCulture)));
        var students = Enumerable.Range(1, requests).Select(index => index.ToString("D17", CultureInfo.InvariantCulture)).ToArray();
        var (responses, blocked) = await ContendAsync(scope, admissionClass.Id, students);
        try
        {
            var successes = responses.Count(response => response.StatusCode == HttpStatusCode.Created);
            var conflicts = responses.Count(response => response.StatusCode == HttpStatusCode.Conflict);
            Assert.Equal(requests, blocked);
            Assert.Equal(seats - confirmedSeats, successes);
            Assert.Equal(requests - successes, conflicts);
            var rows = await scope.HoldsAsync(admissionClass.Id);
            var now = DateTime.UtcNow;
            Assert.Equal(seats, rows.Count);
            Assert.Equal(confirmedSeats, rows.Count(row => row.Status == HoldStatus.Confirmed));
            Assert.Equal(seats, rows.Count(row => row.Status == HoldStatus.Confirmed ||
                (row.Status == HoldStatus.Held && row.ExpiresAt > now)));
            Assert.Equal(rows.Count, rows.Select(row => row.StudentId).Distinct().Count());
            foreach (var response in responses.Where(response => response.StatusCode == HttpStatusCode.Created))
            {
                var created = (await response.Content.ReadFromJsonAsync<CreatedHoldResponse>())!;
                Assert.Contains(rows, row => row.Id == created.HoldId && row.StudentId == created.StudentId);
            }
            output.WriteLine($"{requests} simultaneous requests across 2 API hosts; {blocked} observed waiting in PostgreSQL; " +
                $"{successes} created, {conflicts} conflict; committed occupancy {seats}/{seats} ({confirmedSeats} confirmed).");
        }
        finally { foreach (var response in responses) response.Dispose(); }
    }

    [PostgresTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ConcurrentSameStudent_CreatesOnlyOneActiveHoldAndPreservesStaleHistory(bool hasStaleHistory)
    {
        await using var scope = new HoldApiTestScope(fixture);
        var admissionClass = await scope.AddClassAsync(5);
        var stale = History(admissionClass.Id, HoldStatus.Held, Past);
        if (hasStaleHistory)
            await scope.SeedAsync(stale);
        var (responses, blocked) = await ContendAsync(scope, admissionClass.Id, Enumerable.Repeat(Student, 24).ToArray());
        try
        {
            Assert.Equal(24, blocked);
            Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Created);
            Assert.Equal(23, responses.Count(response => response.StatusCode == HttpStatusCode.Conflict));
            var rows = await scope.HoldsAsync(admissionClass.Id);
            Assert.Equal(hasStaleHistory ? 2 : 1, rows.Count);
            var active = Assert.Single(rows, row => row.Status == HoldStatus.Held && row.ExpiresAt > DateTime.UtcNow);
            Assert.Equal(Student, active.StudentId);
            if (hasStaleHistory)
                Assert.Equal(HoldStatus.Expired, Assert.Single(rows, row => row.Id == stale.Id).Status);
            output.WriteLine($"24 simultaneous same-student requests across 2 API hosts; {blocked} observed waiting; " +
                $"1 created, 23 conflict; 1 committed active hold; stale history present: {hasStaleHistory}.");
        }
        finally { foreach (var response in responses) response.Dispose(); }
    }

    [PostgresFact]
    public async Task LockedClass_DoesNotBlockAnotherClass_AndDecisionTimeIsAfterLockAcquisition()
    {
        await using var scope = new HoldApiTestScope(fixture);
        var first = await scope.AddClassAsync(1);
        var second = await scope.AddClassAsync(1);
        await using var blocker = scope.CreateContext();
        await using var transaction = await blocker.Database.BeginTransactionAsync();
        await blocker.AdmissionClasses.FromSqlInterpolated($"""
            SELECT * FROM "AdmissionClasses" WHERE "Id" = {first.Id} FOR UPDATE
            """).ToListAsync();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var waiting = scope.PostAsync(first.Id, Student, cancellationToken: deadline.Token);
        await scope.WaitForBlockedRequestsAsync(1, deadline.Token);
        using var independent = await scope.PostAsync(second.Id, Student, cancellationToken: deadline.Token)
            .WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(HttpStatusCode.Created, independent.StatusCode);
        Assert.False(waiting.IsCompleted);
        var beforeRelease = DateTime.UtcNow;
        await transaction.CommitAsync(deadline.Token);
        using var response = await waiting.WaitAsync(deadline.Token);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var stored = Assert.Single(await scope.HoldsAsync(first.Id));
        Assert.True(stored.CreatedAt >= beforeRelease.AddTicks(-10)); // PostgreSQL stores microseconds.
        Assert.Single(await scope.HoldsAsync(second.Id));
        output.WriteLine("Class B committed while class A's request waited for its row lock; A used a timestamp after release.");
    }
}
