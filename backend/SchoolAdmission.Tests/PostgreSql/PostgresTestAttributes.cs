namespace SchoolAdmission.Tests.PostgreSql;

internal static class PostgresTestSettings
{
    public const string ConnectionVariable = "SCHOOL_ADMISSION_TEST_CONNECTION";
    public const string DatabaseName = "school_admission_m2_tests";
    public const string SkipReason =
        "PostgreSQL not verified: set SCHOOL_ADMISSION_TEST_CONNECTION to the dedicated school_admission_m2_tests database.";
}

public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(PostgresTestSettings.ConnectionVariable)))
            Skip = PostgresTestSettings.SkipReason;
    }
}

public sealed class PostgresTheoryAttribute : TheoryAttribute
{
    public PostgresTheoryAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(PostgresTestSettings.ConnectionVariable)))
            Skip = PostgresTestSettings.SkipReason;
    }
}
