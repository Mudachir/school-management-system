using System.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Contracts.Holds;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Domain;
using SchoolAdmission.Api.Validation;

namespace SchoolAdmission.Api.Controllers;

[ApiController]
[Route("holds")]
public sealed class HoldLifecycleController(AppDbContext context) : ControllerBase
{
    // Per the assignment, lookup requires no student header and discloses no StudentId.
    [HttpGet("{holdId}")]
    public async Task<ActionResult<HoldResponse>> GetById(Guid holdId, CancellationToken cancellationToken)
    {
        await using var transaction = await context.Database.BeginTransactionAsync(
            IsolationLevel.ReadCommitted, cancellationToken);
        var hold = await LockHoldAsync(holdId, cancellationToken);
        if (hold is null)
            return NotFound();

        await NormalizeExpiryAsync(hold, DateTime.UtcNow, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new HoldResponse(hold.Id, hold.ClassId, hold.Status.ToString().ToUpperInvariant(), hold.ExpiresAt);
    }

    [HttpPost("{holdId}/confirm")]
    public async Task<ActionResult<ConfirmedHoldResponse>> Confirm(Guid holdId, CancellationToken cancellationToken)
    {
        if (!StudentIdHeader.TryRead(Request.Headers, out var studentId))
        {
            ModelState.AddModelError(StudentIdHeader.Name, StudentIdHeader.ValidationMessage);
            return ValidationProblem(ModelState);
        }

        await using var transaction = await context.Database.BeginTransactionAsync(
            IsolationLevel.ReadCommitted, cancellationToken);
        var hold = await LockHoldAsync(holdId, cancellationToken);
        if (hold is null || hold.StudentId != studentId)
            return NotFound();

        var decisionUtc = DateTime.UtcNow;
        await NormalizeExpiryAsync(hold, decisionUtc, cancellationToken);
        if (hold.Status == HoldStatus.Confirmed)
        {
            await transaction.CommitAsync(cancellationToken);
            return new ConfirmedHoldResponse(hold.Id, "CONFIRMED");
        }
        if (hold.Status != HoldStatus.Held)
        {
            // Persist targeted expiry even when confirmation is rejected.
            await transaction.CommitAsync(cancellationToken);
            return Problem(statusCode: StatusCodes.Status409Conflict,
                title: "Only an unexpired hold can be confirmed.");
        }

        hold.Status = HoldStatus.Confirmed;
        hold.ConfirmedAt = decisionUtc;
        await context.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new ConfirmedHoldResponse(hold.Id, "CONFIRMED");
    }

    [HttpDelete("{holdId}")]
    public async Task<IActionResult> Cancel(Guid holdId, CancellationToken cancellationToken)
    {
        if (!StudentIdHeader.TryRead(Request.Headers, out var studentId))
        {
            ModelState.AddModelError(StudentIdHeader.Name, StudentIdHeader.ValidationMessage);
            return ValidationProblem(ModelState);
        }

        await using var transaction = await context.Database.BeginTransactionAsync(
            IsolationLevel.ReadCommitted, cancellationToken);
        var hold = await LockHoldAsync(holdId, cancellationToken);
        if (hold is null || hold.StudentId != studentId)
            return NotFound();

        var decisionUtc = DateTime.UtcNow;
        await NormalizeExpiryAsync(hold, decisionUtc, cancellationToken);
        if (hold.Status == HoldStatus.Expired)
        {
            await transaction.CommitAsync(cancellationToken);
            return Problem(statusCode: StatusCodes.Status409Conflict, title: "Expired holds cannot be cancelled.");
        }
        if (hold.Status != HoldStatus.Cancelled)
        {
            // Prototype policy permits cancelling HELD and CONFIRMED admissions.
            hold.Status = HoldStatus.Cancelled;
            hold.CancelledAt = decisionUtc;
            await context.SaveChangesAsync(cancellationToken);
        }
        await transaction.CommitAsync(cancellationToken);
        return NoContent();
    }

    private async Task<AdmissionHold?> LockHoldAsync(Guid holdId, CancellationToken cancellationToken)
    {
        // Resolve only the class ID before waiting. Never track a stale hold here.
        var classId = await context.AdmissionHolds.AsNoTracking().Where(hold => hold.Id == holdId)
            .Select(hold => (Guid?)hold.ClassId).SingleOrDefaultAsync(cancellationToken);
        if (!classId.HasValue ||
            await ClassRowLock.AcquireAsync(context, classId.Value, cancellationToken) is null)
            return null;

        // Always class row first, then targeted hold row, compatible with M4.
        var holds = await context.AdmissionHolds.FromSqlInterpolated($"""
            SELECT * FROM "AdmissionHolds" WHERE "Id" = {holdId} AND "ClassId" = {classId.Value} FOR UPDATE
            """).ToListAsync(cancellationToken);
        return holds.SingleOrDefault();
    }

    private async Task NormalizeExpiryAsync(AdmissionHold hold, DateTime decisionUtc, CancellationToken cancellationToken)
    {
        if (hold.Status == HoldStatus.Held && hold.ExpiresAt <= decisionUtc)
        {
            hold.Status = HoldStatus.Expired;
            await context.SaveChangesAsync(cancellationToken);
        }
    }
}
