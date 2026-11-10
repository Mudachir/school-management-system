namespace SchoolAdmission.Api.Configuration;

public sealed class HoldExpirationOptions
{
    // Task.Delay's timer accepts at most uint.MaxValue - 1 milliseconds.
    public const int MaximumPollSeconds = 4_294_967;

    [ConfigurationKeyName("HOLD_EXPIRATION_POLL_SECONDS")]
    public int PollSeconds { get; set; } = 5;
}
