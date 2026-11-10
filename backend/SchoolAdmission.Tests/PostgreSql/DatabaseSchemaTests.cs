using Microsoft.EntityFrameworkCore;
using Npgsql;
using SchoolAdmission.Api.Domain;

namespace SchoolAdmission.Tests.PostgreSql;

[Trait("Category", "PostgreSQL")]
public sealed class DatabaseSchemaTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>
{
    private static readonly DateTime CreatedAt = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static AdmissionClass NewClass(string? name = null, int seats = 20) => new()
    {
        Name = name ?? $"Class {Guid.NewGuid():N}",
        TotalSeats = seats,
        CreatedAt = CreatedAt
    };

    private static AdmissionHold NewHold(Guid classId, HoldStatus status = HoldStatus.Held,
        string studentId = "01234567890123456") => new()
    {
        ClassId = classId,
        StudentId = studentId,
        Status = status,
        CreatedAt = CreatedAt,
        ExpiresAt = CreatedAt.AddMinutes(10)
    };

    private static async Task AssertViolationAsync(Func<Task> save, string sqlState, string constraint)
    {
        var exception = await Assert.ThrowsAsync<DbUpdateException>(save);
        var postgres = Assert.IsType<PostgresException>(exception.InnerException);
        Assert.Equal(sqlState, postgres.SqlState);
        Assert.Equal(constraint, postgres.ConstraintName);
    }

    [PostgresFact]
    public async Task ValidClassAndHold_RoundTripWithUtcTimestampsAndLeadingZeroStudentId()
    {
        await using var context = await fixture.CreateTransactionalContextAsync();
        var admissionClass = NewClass();
        var hold = NewHold(admissionClass.Id);
        context.AddRange(admissionClass, hold);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var stored = await context.AdmissionHolds.Include(item => item.Class).SingleAsync(item => item.Id == hold.Id);
        Assert.Equal(admissionClass.Name, stored.Class.Name);
        Assert.Equal("01234567890123456", stored.StudentId);
        Assert.Equal(HoldStatus.Held, stored.Status);
        Assert.Equal(CreatedAt, stored.CreatedAt);
        Assert.Equal(DateTimeKind.Utc, stored.CreatedAt.Kind);
        Assert.Equal(CreatedAt.AddMinutes(10), stored.ExpiresAt);
        Assert.Null(stored.ConfirmedAt);
        Assert.Null(stored.CancelledAt);
    }

    [PostgresTheory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task NonPositiveSeats_AreRejectedByPostgres(int seats)
    {
        await using var context = await fixture.CreateTransactionalContextAsync();
        context.Add(NewClass(seats: seats));
        await AssertViolationAsync(() => context.SaveChangesAsync(), PostgresErrorCodes.CheckViolation,
            "CK_AdmissionClasses_TotalSeats");
    }

    [PostgresTheory]
    [InlineData("1234567890123456")]
    [InlineData("1234567890123456x")]
    [InlineData("১২৩৪৫৬৭৮৯০১২৩৪৫৬৭")]
    [InlineData("")]
    public async Task InvalidStudentId_IsRejectedByPostgres(string studentId)
    {
        await using var context = await fixture.CreateTransactionalContextAsync();
        var admissionClass = NewClass();
        context.Add(admissionClass);
        await context.SaveChangesAsync();
        context.Add(NewHold(admissionClass.Id, studentId: studentId));
        await AssertViolationAsync(() => context.SaveChangesAsync(), PostgresErrorCodes.CheckViolation,
            "CK_AdmissionHolds_StudentId");
    }

    [PostgresFact]
    public async Task OverlongStudentId_IsRejectedByVarcharLimit()
    {
        await using var context = await fixture.CreateTransactionalContextAsync();
        var admissionClass = NewClass();
        context.Add(admissionClass);
        await context.SaveChangesAsync();
        context.Add(NewHold(admissionClass.Id, studentId: "123456789012345678"));
        var exception = await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
        Assert.Equal(PostgresErrorCodes.StringDataRightTruncation,
            Assert.IsType<PostgresException>(exception.InnerException).SqlState);
    }

    [PostgresFact]
    public async Task UnknownStatus_IsRejectedByPostgres()
    {
        await using var context = await fixture.CreateTransactionalContextAsync();
        var admissionClass = NewClass();
        context.Add(admissionClass);
        await context.SaveChangesAsync();
        context.Add(NewHold(admissionClass.Id, (HoldStatus)999));
        await AssertViolationAsync(() => context.SaveChangesAsync(), PostgresErrorCodes.CheckViolation,
            "CK_AdmissionHolds_Status");
    }

    [PostgresTheory]
    [InlineData(HoldStatus.Held, HoldStatus.Held)]
    [InlineData(HoldStatus.Held, HoldStatus.Confirmed)]
    [InlineData(HoldStatus.Confirmed, HoldStatus.Held)]
    [InlineData(HoldStatus.Confirmed, HoldStatus.Confirmed)]
    public async Task DuplicateActiveApplication_IsRejectedEvenWhenHeldTimestampHasElapsed(
        HoldStatus existingStatus, HoldStatus newStatus)
    {
        await using var context = await fixture.CreateTransactionalContextAsync();
        var admissionClass = NewClass();
        context.Add(admissionClass);
        context.Add(NewHold(admissionClass.Id, existingStatus));
        await context.SaveChangesAsync();
        context.Add(NewHold(admissionClass.Id, newStatus));
        await AssertViolationAsync(() => context.SaveChangesAsync(), PostgresErrorCodes.UniqueViolation,
            "UX_AdmissionHolds_StudentId_ClassId_Active");
    }

    [PostgresTheory]
    [InlineData(HoldStatus.Expired, HoldStatus.Held)]
    [InlineData(HoldStatus.Expired, HoldStatus.Confirmed)]
    [InlineData(HoldStatus.Cancelled, HoldStatus.Held)]
    [InlineData(HoldStatus.Cancelled, HoldStatus.Confirmed)]
    public async Task InactiveHistory_PermitsReplacementAndRemainsStored(HoldStatus inactiveStatus, HoldStatus newStatus)
    {
        await using var context = await fixture.CreateTransactionalContextAsync();
        var admissionClass = NewClass();
        var original = NewHold(admissionClass.Id);
        context.AddRange(admissionClass, original);
        await context.SaveChangesAsync();
        original.Status = inactiveStatus;
        await context.SaveChangesAsync();
        context.Add(NewHold(admissionClass.Id, newStatus));
        await context.SaveChangesAsync();

        Assert.Equal(2, await context.AdmissionHolds.CountAsync(hold => hold.ClassId == admissionClass.Id));
        Assert.Equal(inactiveStatus, (await context.AdmissionHolds.FindAsync(original.Id))!.Status);
    }

    [PostgresFact]
    public async Task ClassName_IsUniqueIgnoringCase()
    {
        await using var context = await fixture.CreateTransactionalContextAsync();
        var name = $"Grade {Guid.NewGuid():N}";
        context.Add(NewClass(name));
        await context.SaveChangesAsync();
        context.Add(NewClass(name.ToUpperInvariant()));
        await AssertViolationAsync(() => context.SaveChangesAsync(), PostgresErrorCodes.UniqueViolation,
            "UX_AdmissionClasses_Name_Lower");
    }

    [PostgresFact]
    public async Task HoldWithoutClass_IsRejectedByForeignKey()
    {
        await using var context = await fixture.CreateTransactionalContextAsync();
        context.Add(NewHold(Guid.NewGuid()));
        await AssertViolationAsync(() => context.SaveChangesAsync(), PostgresErrorCodes.ForeignKeyViolation,
            "FK_AdmissionHolds_AdmissionClasses_ClassId");
    }

    [PostgresFact]
    public async Task ClassWithHistory_CannotBeDeleted()
    {
        await using var context = await fixture.CreateTransactionalContextAsync();
        var admissionClass = NewClass();
        var hold = NewHold(admissionClass.Id, HoldStatus.Cancelled);
        context.AddRange(admissionClass, hold);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var transaction = context.Database.CurrentTransaction!;
        await transaction.CreateSavepointAsync("BeforeClassDelete");
        context.Remove(admissionClass);
        // PostgreSQL 18 reports ON DELETE RESTRICT as restrict_violation (23001).
        await AssertViolationAsync(() => context.SaveChangesAsync(), PostgresErrorCodes.RestrictViolation,
            "FK_AdmissionHolds_AdmissionClasses_ClassId");

        // Recover from the rejected statement without rolling back the setup rows.
        await transaction.RollbackToSavepointAsync("BeforeClassDelete");
        context.ChangeTracker.Clear();
        var storedClass = await context.AdmissionClasses.AsNoTracking()
            .SingleAsync(item => item.Id == admissionClass.Id);
        var storedHold = await context.AdmissionHolds.AsNoTracking()
            .SingleAsync(item => item.Id == hold.Id);
        Assert.Equal(admissionClass.Name, storedClass.Name);
        Assert.Equal(admissionClass.TotalSeats, storedClass.TotalSeats);
        Assert.Equal(admissionClass.Id, storedHold.ClassId);
        Assert.Equal(hold.StudentId, storedHold.StudentId);
        Assert.Equal(HoldStatus.Cancelled, storedHold.Status);
    }

    [PostgresFact]
    public async Task RequiredIndexes_ArePresentWithExpectedExpressionsAndOrdering()
    {
        await using var context = await fixture.CreateTransactionalContextAsync();
        var connection = context.Database.GetDbConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT indexname, indexdef FROM pg_indexes
            WHERE schemaname = 'public' AND tablename IN ('AdmissionClasses', 'AdmissionHolds')
            """;
        await using var reader = await command.ExecuteReaderAsync();
        var indexes = new Dictionary<string, string>();
        while (await reader.ReadAsync())
            indexes.Add(reader.GetString(0), reader.GetString(1));

        var nameIndex = indexes["UX_AdmissionClasses_Name_Lower"];
        Assert.Contains("CREATE UNIQUE INDEX", nameIndex);
        Assert.Contains("lower(", nameIndex);
        Assert.Contains("\"Name\"", nameIndex);
        var activeIndex = indexes["UX_AdmissionHolds_StudentId_ClassId_Active"];
        Assert.Contains("CREATE UNIQUE INDEX", activeIndex);
        Assert.Contains("(\"StudentId\", \"ClassId\")", activeIndex);
        Assert.Contains("WHERE", activeIndex);
        Assert.Contains("HELD", activeIndex);
        Assert.Contains("CONFIRMED", activeIndex);
        Assert.DoesNotContain("now()", activeIndex);
        Assert.Contains("(\"Status\", \"ExpiresAt\")", indexes["IX_AdmissionHolds_Status_ExpiresAt"]);
        Assert.Contains("(\"StudentId\", \"CreatedAt\" DESC)", indexes["IX_AdmissionHolds_StudentId_CreatedAt"]);
        Assert.Contains("(\"ClassId\")", indexes["IX_AdmissionHolds_ClassId"]);
    }

    [PostgresFact]
    public async Task Columns_MatchRequiredTypesLengthsAndNullabilityWithoutStudentTable()
    {
        await using var context = await fixture.CreateTransactionalContextAsync();
        var connection = context.Database.GetDbConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT table_name || '.' || column_name,
                   data_type || ':' || coalesce(character_maximum_length::text, '') || ':' || is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name <> '__EFMigrationsHistory'
            ORDER BY table_name, column_name
            """;
        await using var reader = await command.ExecuteReaderAsync();
        var columns = new Dictionary<string, string>();
        while (await reader.ReadAsync())
            columns.Add(reader.GetString(0), reader.GetString(1));

        var expected = new Dictionary<string, string>
        {
            ["AdmissionClasses.Id"] = "uuid::NO",
            ["AdmissionClasses.Name"] = "character varying:150:NO",
            ["AdmissionClasses.TotalSeats"] = "integer::NO",
            ["AdmissionClasses.CreatedAt"] = "timestamp with time zone::NO",
            ["AdmissionHolds.Id"] = "uuid::NO",
            ["AdmissionHolds.ClassId"] = "uuid::NO",
            ["AdmissionHolds.StudentId"] = "character varying:17:NO",
            ["AdmissionHolds.Status"] = "character varying:20:NO",
            ["AdmissionHolds.CreatedAt"] = "timestamp with time zone::NO",
            ["AdmissionHolds.ExpiresAt"] = "timestamp with time zone::NO",
            ["AdmissionHolds.ConfirmedAt"] = "timestamp with time zone::YES",
            ["AdmissionHolds.CancelledAt"] = "timestamp with time zone::YES"
        };
        Assert.Equal(expected.OrderBy(item => item.Key), columns.OrderBy(item => item.Key));
    }
}
