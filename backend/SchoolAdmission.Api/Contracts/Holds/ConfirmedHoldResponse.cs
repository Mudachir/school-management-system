namespace SchoolAdmission.Api.Contracts.Holds;

public sealed record ConfirmedHoldResponse(Guid HoldId, string Status);
