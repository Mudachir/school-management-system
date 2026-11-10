using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Contracts.Classes;
using SchoolAdmission.Api.Domain;

namespace SchoolAdmission.Tests.PostgreSql;

[Trait("Category", "PostgreSQL")]
public sealed class ClassEndpointsTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>
{
    private static readonly DateTime Past = new(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Future = new(2100, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static AdmissionClass NewClass(string name, int seats = 10) => new()
    {
        Name = name, TotalSeats = seats, CreatedAt = Past
    };

    private static AdmissionHold NewHold(AdmissionClass admissionClass, int student, HoldStatus status,
        DateTime expiresAt) => new()
    {
        ClassId = admissionClass.Id,
        StudentId = student.ToString("D17", CultureInfo.InvariantCulture),
        Status = status,
        CreatedAt = Past.AddDays(-1),
        ExpiresAt = expiresAt
    };

    [PostgresFact]
    public async Task Create_TrimsNamePersistsClassAndReturnsWorkingLocation()
    {
        await using var scope = await ClassApiTestScope.CreateAsync(fixture);
        var before = DateTime.UtcNow;
        using var response = await scope.Client.PostAsJsonAsync("/classes", new
        {
            name = "  Class 6 - Morning Shift  ", totalSeats = 120,
            heldSeats = 99, confirmedSeats = 99, availableSeats = 999
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(3, json.EnumerateObject().Count());
        Assert.Equal(JsonValueKind.String, json.GetProperty("id").ValueKind);
        var created = json.Deserialize<CreatedClassResponse>(JsonSerializerOptions.Web);
        Assert.NotNull(created);
        Assert.NotEqual(Guid.Empty, created.Id);
        Assert.Equal("Class 6 - Morning Shift", created.Name);
        Assert.Equal(120, created.TotalSeats);

        var stored = await scope.Database.AdmissionClasses.AsNoTracking().SingleAsync();
        Assert.Equal(created.Id, stored.Id);
        Assert.Equal(created.Name, stored.Name);
        Assert.Equal(created.TotalSeats, stored.TotalSeats);
        Assert.Equal(DateTimeKind.Utc, stored.CreatedAt.Kind);
        Assert.InRange(stored.CreatedAt, before.AddSeconds(-1), DateTime.UtcNow.AddSeconds(1));

        Assert.NotNull(response.Headers.Location);
        Assert.EndsWith($"/classes/{created.Id}", response.Headers.Location.ToString());
        using var read = await scope.Client.GetAsync(response.Headers.Location);
        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
        var summary = await read.Content.ReadFromJsonAsync<ClassSummaryResponse>();
        Assert.Equal(new ClassSummaryResponse(created.Id, created.Name, 120, 0, 0, 120), summary);
    }

    [PostgresTheory]
    [InlineData(1)]
    [InlineData(int.MaxValue)]
    public async Task Create_AcceptsMaximumLengthTrimmedNameAndPositiveSeatBoundaries(int seats)
    {
        await using var scope = await ClassApiTestScope.CreateAsync(fixture);
        var name = new string('N', 150);
        using var response = await scope.Client.PostAsJsonAsync("/classes", new { name = $" {name} ", totalSeats = seats });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<CreatedClassResponse>();
        Assert.NotNull(created);
        Assert.Equal(name, created.Name);
        Assert.Equal(seats, created.TotalSeats);
    }

    public static IEnumerable<object[]> InvalidRequests()
    {
        foreach (var json in new[]
        {
            "{}", "{\"totalSeats\":10}", "{\"name\":null,\"totalSeats\":10}",
            "{\"name\":\"\",\"totalSeats\":10}", "{\"name\":\" \\t \",\"totalSeats\":10}",
            "{\"name\":42,\"totalSeats\":10}", "{\"name\":\"Grade 6\"}",
            "{\"name\":\"Grade 6\",\"totalSeats\":0}", "{\"name\":\"Grade 6\",\"totalSeats\":-1}",
            "{\"name\":\"Grade 6\",\"totalSeats\":1.5}", "{\"name\":\"Grade 6\",\"totalSeats\":2147483648}",
            "{\"name\":\"Grade 6\",\"totalSeats\":true}", "{\"name\":\"Grade 6\",\"totalSeats\":\"10\"}",
            "{\"name\":\"Grade 6\",\"totalSeats\":null}", "null", "[]", "{", ""
        })
            yield return new object[] { json };
        yield return new object[] { JsonSerializer.Serialize(new { name = new string('N', 151), totalSeats = 10 }) };
    }

    [PostgresTheory]
    [MemberData(nameof(InvalidRequests))]
    public async Task Create_InvalidInputReturnsValidationProblemWithoutPersisting(string json)
    {
        await using var scope = await ClassApiTestScope.CreateAsync(fixture);
        using var body = new StringContent(json, Encoding.UTF8, "application/json");
        using var response = await scope.Client.PostAsync("/classes", body);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(400, problem.GetProperty("status").GetInt32());
        Assert.NotEmpty(problem.GetProperty("errors").EnumerateObject());
        Assert.False(await scope.Database.AdmissionClasses.AnyAsync());
    }

    [PostgresTheory]
    [InlineData("Grade 6")]
    [InlineData("gRADE 6")]
    [InlineData("  Grade 6  ")]
    public async Task Create_DuplicateNameReturnsConflictAndPreservesOriginal(string duplicateName)
    {
        await using var scope = await ClassApiTestScope.CreateAsync(fixture);
        using var first = await scope.Client.PostAsJsonAsync("/classes", new { name = "Grade 6", totalSeats = 10 });
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var original = await first.Content.ReadFromJsonAsync<CreatedClassResponse>();

        using var duplicate = await scope.Client.PostAsJsonAsync("/classes", new { name = duplicateName, totalSeats = 99 });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Equal("application/problem+json", duplicate.Content.Headers.ContentType?.MediaType);
        var problem = await duplicate.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(409, problem.GetProperty("status").GetInt32());
        Assert.Equal("A class with this name already exists.", problem.GetProperty("title").GetString());
        var stored = await scope.Database.AdmissionClasses.AsNoTracking().SingleAsync();
        Assert.NotNull(original);
        Assert.Equal(original.Id, stored.Id);
        Assert.Equal("Grade 6", stored.Name);
        Assert.Equal(10, stored.TotalSeats);
    }

    [PostgresFact]
    public async Task GetAll_EmptyDatabaseReturnsEmptyArray()
    {
        await using var scope = await ClassApiTestScope.CreateAsync(fixture);
        using var response = await scope.Client.GetAsync("/classes");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty((await response.Content.ReadFromJsonAsync<ClassSummaryResponse[]>())!);
    }

    [PostgresFact]
    public async Task GetAll_ReturnsNameOrderedSummariesInOneQuery()
    {
        await using var scope = await ClassApiTestScope.CreateAsync(fixture);
        scope.Database.AddRange(NewClass("Zulu"), NewClass("Alpha"), NewClass("Middle"));
        await scope.Database.SaveChangesAsync();
        scope.ResetQueryCount();

        using var response = await scope.Client.GetAsync("/classes");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var summaries = await response.Content.ReadFromJsonAsync<ClassSummaryResponse[]>();
        Assert.NotNull(summaries);
        Assert.Equal(new[] { "Alpha", "Middle", "Zulu" }, summaries.Select(item => item.Name));
        Assert.All(summaries, item =>
        {
            Assert.Equal(10, item.TotalSeats);
            Assert.Equal(0, item.HeldSeats);
            Assert.Equal(0, item.ConfirmedSeats);
            Assert.Equal(10, item.AvailableSeats);
        });
        Assert.Equal(1, scope.RequestQueryCount);
    }

    [PostgresFact]
    public async Task GetById_UnknownUuidReturnsNotFound()
    {
        await using var scope = await ClassApiTestScope.CreateAsync(fixture);
        using var response = await scope.Client.GetAsync($"/classes/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(404, problem.GetProperty("status").GetInt32());
    }

    [PostgresTheory]
    [InlineData("not-a-guid")]
    [InlineData("c_123")]
    [InlineData("123")]
    public async Task GetById_MalformedUuidReturnsBadRequest(string id)
    {
        await using var scope = await ClassApiTestScope.CreateAsync(fixture);
        using var response = await scope.Client.GetAsync($"/classes/{id}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(400, problem.GetProperty("status").GetInt32());
        Assert.True(problem.GetProperty("errors").TryGetProperty("classId", out _));
    }

    [PostgresFact]
    public async Task Reads_CountEffectiveHoldsPerClassWithoutMutatingHistory()
    {
        await using var scope = await ClassApiTestScope.CreateAsync(fixture);
        var alpha = NewClass("Alpha");
        var beta = NewClass("Beta", 3);
        var empty = NewClass("Empty", 4);
        var holds = new[]
        {
            NewHold(alpha, 1, HoldStatus.Held, Future), NewHold(alpha, 2, HoldStatus.Held, Future),
            NewHold(alpha, 3, HoldStatus.Held, Past), NewHold(alpha, 4, HoldStatus.Held, Past.AddDays(-1)),
            NewHold(alpha, 5, HoldStatus.Confirmed, Past), NewHold(alpha, 6, HoldStatus.Confirmed, Future),
            NewHold(alpha, 7, HoldStatus.Confirmed, Past), NewHold(alpha, 8, HoldStatus.Expired, Future),
            NewHold(alpha, 9, HoldStatus.Cancelled, Future), NewHold(beta, 1, HoldStatus.Held, Future)
        };
        scope.Database.AddRange(alpha, beta, empty);
        scope.Database.AddRange(holds);
        await scope.Database.SaveChangesAsync();
        var expected = new[]
        {
            new ClassSummaryResponse(alpha.Id, "Alpha", 10, 2, 3, 5),
            new ClassSummaryResponse(beta.Id, "Beta", 3, 1, 0, 2),
            new ClassSummaryResponse(empty.Id, "Empty", 4, 0, 0, 4)
        };

        scope.ResetQueryCount();
        using var response = await scope.Client.GetAsync("/classes");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var summaries = await response.Content.ReadFromJsonAsync<ClassSummaryResponse[]>();
        Assert.Equal(expected, summaries);
        Assert.Equal(1, scope.RequestQueryCount);
        foreach (var summary in expected)
        {
            scope.ResetQueryCount();
            using var read = await scope.Client.GetAsync($"/classes/{summary.Id}");
            Assert.Equal(HttpStatusCode.OK, read.StatusCode);
            Assert.Equal(summary, await read.Content.ReadFromJsonAsync<ClassSummaryResponse>());
            Assert.Equal(1, scope.RequestQueryCount);
        }

        // Read from PostgreSQL again rather than trusting the seeding context's tracked objects.
        var stored = await scope.Database.AdmissionHolds.AsNoTracking().ToDictionaryAsync(hold => hold.Id);
        Assert.Equal(holds.Length, stored.Count);
        foreach (var hold in holds)
        {
            Assert.Equal(hold.Status, stored[hold.Id].Status);
            Assert.Equal(hold.ExpiresAt, stored[hold.Id].ExpiresAt);
        }
    }

    [PostgresFact]
    public async Task Reads_ClampAvailableSeatsButExposeRawCountsForOverCapacityData()
    {
        await using var scope = await ClassApiTestScope.CreateAsync(fixture);
        var admissionClass = NewClass("Over capacity", 1);
        scope.Database.Add(admissionClass);
        scope.Database.AddRange(NewHold(admissionClass, 1, HoldStatus.Held, Future),
            NewHold(admissionClass, 2, HoldStatus.Held, Future), NewHold(admissionClass, 3, HoldStatus.Confirmed, Past));
        await scope.Database.SaveChangesAsync();

        using var response = await scope.Client.GetAsync($"/classes/{admissionClass.Id}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var summary = await response.Content.ReadFromJsonAsync<ClassSummaryResponse>();
        Assert.Equal(new ClassSummaryResponse(admissionClass.Id, admissionClass.Name, 1, 2, 1, 0), summary);
        Assert.True(summary!.HeldSeats + summary.ConfirmedSeats > summary.TotalSeats);
        using var list = await scope.Client.GetAsync("/classes");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        Assert.Equal(summary, Assert.Single((await list.Content.ReadFromJsonAsync<ClassSummaryResponse[]>())!));
    }
}
