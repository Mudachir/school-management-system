namespace SchoolAdmission.Api.Contracts.Holds;

public sealed record StudentHoldResponse(Guid HoldId, Guid ClassId, string ClassName, string Status, DateTime ExpiresAt);
