using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Contracts.Holds;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Domain;
using SchoolAdmission.Api.Validation;

namespace SchoolAdmission.Api.Controllers;

[ApiController]
[Route("me/holds")]
public sealed class MyHoldsController(AppDbContext context) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<StudentHoldResponse>>> Get(CancellationToken cancellationToken)
    {
        if (!StudentIdHeader.TryRead(Request.Headers, out var studentId))
        {
            ModelState.AddModelError(StudentIdHeader.Name, StudentIdHeader.ValidationMessage);
            return ValidationProblem(ModelState);
        }

        var now = DateTime.UtcNow;
        return await context.AdmissionHolds.AsNoTracking().Where(hold => hold.StudentId == studentId)
            .OrderByDescending(hold => hold.CreatedAt).ThenBy(hold => hold.Id)
            .Select(hold => new StudentHoldResponse(hold.Id, hold.ClassId, hold.Class.Name,
                hold.Status == HoldStatus.Held ? (hold.ExpiresAt <= now ? "EXPIRED" : "HELD") :
                hold.Status == HoldStatus.Confirmed ? "CONFIRMED" :
                hold.Status == HoldStatus.Expired ? "EXPIRED" : "CANCELLED", hold.ExpiresAt))
            .ToListAsync(cancellationToken);
    }
}
