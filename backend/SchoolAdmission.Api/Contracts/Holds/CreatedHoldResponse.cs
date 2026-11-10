namespace SchoolAdmission.Api.Contracts.Holds;

public sealed record CreatedHoldResponse(
    Guid HoldId, Guid ClassId, string StudentId, string Status, DateTime ExpiresAt);
