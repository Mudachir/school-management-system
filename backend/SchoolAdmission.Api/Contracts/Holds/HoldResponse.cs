namespace SchoolAdmission.Api.Contracts.Holds;

public sealed record HoldResponse(Guid HoldId, Guid ClassId, string Status, DateTime ExpiresAt);
