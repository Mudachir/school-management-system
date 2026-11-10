using System.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;
using SchoolAdmission.Api.Configuration;
using SchoolAdmission.Api.Contracts.Holds;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Domain;

namespace SchoolAdmission.Api.Controllers;

[ApiController]
[Route("classes/{classId}/holds")]
public sealed class HoldsController(AppDbContext context, IOptions<HoldOptions> holdOptions) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<CreatedHoldResponse>> Create(Guid classId, CancellationToken cancellationToken)
    {
        var values = Request.Headers["X-Student-Id"];
        var studentId = values.Count == 1 ? values[0] : null;
        if (studentId is null || studentId.Length != 17 || studentId.Any(character => character is < '0' or > '9'))
        {
            ModelState.AddModelError("X-Student-Id", "X-Student-Id must contain exactly 17 ASCII digits.");
            return ValidationProblem(ModelState);
        }

        await using var transaction = await context.Database.BeginTransactionAsync(
            IsolationLevel.ReadCommitted, cancellationToken);

        // Materialize the targeted SQL directly; do not compose an EF query over
        // FOR UPDATE. Every allocation takes this same class-row lock first.
        var classes = await context.AdmissionClasses.FromSqlInterpolated($"""
            SELECT * FROM "AdmissionClasses" WHERE "Id" = {classId} FOR UPDATE
            """).AsNoTracking().ToListAsync(cancellationToken);
        var admissionClass = classes.SingleOrDefault();
        if (admissionClass is null)
            return NotFound();

        // Lock waits can cross expiry boundaries. Make all decisions using a
        // fresh timestamp captured only after the lock has been acquired.
        var decisionUtc = DateTime.UtcNow;
        await context.AdmissionHolds
            .Where(hold => hold.ClassId == classId && hold.StudentId == studentId &&
                           hold.Status == HoldStatus.Held && hold.ExpiresAt <= decisionUtc)
            .ExecuteUpdateAsync(setters => setters.SetProperty(hold => hold.Status, HoldStatus.Expired),
                cancellationToken);

        var active = context.AdmissionHolds.Where(hold => hold.ClassId == classId &&
            (hold.Status == HoldStatus.Confirmed ||
             (hold.Status == HoldStatus.Held && hold.ExpiresAt > decisionUtc)));
        if (await active.AnyAsync(hold => hold.StudentId == studentId, cancellationToken))
            return Problem(statusCode: StatusCodes.Status409Conflict,
                title: "This student already has an active application for this class.");
        if (await active.CountAsync(cancellationToken) >= admissionClass.TotalSeats)
            return Problem(statusCode: StatusCodes.Status409Conflict, title: "This class has no available seats.");

        var hold = new AdmissionHold
        {
            ClassId = classId,
            StudentId = studentId,
            Status = HoldStatus.Held,
            CreatedAt = decisionUtc,
            ExpiresAt = decisionUtc.AddSeconds(holdOptions.Value.DurationSeconds)
        };
        context.AdmissionHolds.Add(hold);
        try
        {
            await context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException
               { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "UX_AdmissionHolds_StudentId_ClassId_Active" })
        {
            return Problem(statusCode: StatusCodes.Status409Conflict,
                title: "This student already has an active application for this class.");
        }

        // Disposing an uncommitted transaction on any error/conflict rolls back
        // both the insert and expiry normalization and releases the class lock.
        return StatusCode(StatusCodes.Status201Created,
            new CreatedHoldResponse(hold.Id, hold.ClassId, hold.StudentId, "HELD", hold.ExpiresAt));
    }
}
