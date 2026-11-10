namespace SchoolAdmission.Api.Configuration;

public sealed class HoldOptions
{
    [ConfigurationKeyName("HOLD_DURATION_SECONDS")]
    public int DurationSeconds { get; set; } = 600;
}
