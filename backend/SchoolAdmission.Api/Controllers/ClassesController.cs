using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SchoolAdmission.Api.Contracts.Classes;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Domain;

namespace SchoolAdmission.Api.Controllers;

[ApiController]
[Route("classes")]
public sealed class ClassesController(AppDbContext context) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<CreatedClassResponse>> Create(
        CreateClassRequest request, CancellationToken cancellationToken)
    {
        var admissionClass = new AdmissionClass
        {
            Name = request.Name!,
            TotalSeats = request.TotalSeats,
            CreatedAt = DateTime.UtcNow
        };
        context.AdmissionClasses.Add(admissionClass);
        try
        {
            await context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException
               { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "UX_AdmissionClasses_Name_Lower" })
        {
            return Problem(statusCode: StatusCodes.Status409Conflict,
                title: "A class with this name already exists.");
        }

        return CreatedAtAction(nameof(GetById), new { classId = admissionClass.Id },
            new CreatedClassResponse(admissionClass.Id, admissionClass.Name, admissionClass.TotalSeats));
    }

    [HttpGet]
    public async Task<ActionResult<List<ClassSummaryResponse>>> GetAll(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        return await Summaries(now).ToListAsync(cancellationToken);
    }

    // Leave UUID validation to model binding so malformed IDs return 400, not a route miss.
    [HttpGet("{classId}")]
    public async Task<ActionResult<ClassSummaryResponse>> GetById(Guid classId, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var summary = await Summaries(now, classId).SingleOrDefaultAsync(cancellationToken);
        return summary is null ? NotFound() : Ok(summary);
    }

    private IQueryable<ClassSummaryResponse> Summaries(DateTime now, Guid? classId = null)
    {
        var classes = context.AdmissionClasses.AsNoTracking();
        var holds = context.AdmissionHolds.AsNoTracking();
        if (classId.HasValue)
        {
            classes = classes.Where(item => item.Id == classId.Value);
            holds = holds.Where(hold => hold.ClassId == classId.Value);
        }

        var counts = holds
            .Where(hold => hold.Status == HoldStatus.Confirmed ||
                           (hold.Status == HoldStatus.Held && hold.ExpiresAt > now))
            .GroupBy(hold => hold.ClassId)
            .Select(group => new
            {
                ClassId = group.Key,
                HeldSeats = (int?)group.Count(hold => hold.Status == HoldStatus.Held),
                ConfirmedSeats = (int?)group.Count(hold => hold.Status == HoldStatus.Confirmed)
            });

        return from admissionClass in classes.OrderBy(item => item.Name).ThenBy(item => item.Id)
               join count in counts on admissionClass.Id equals count.ClassId into classCounts
               from count in classCounts.DefaultIfEmpty()
               let heldSeats = count.HeldSeats ?? 0
               let confirmedSeats = count.ConfirmedSeats ?? 0
               select new ClassSummaryResponse(admissionClass.Id, admissionClass.Name, admissionClass.TotalSeats,
                   heldSeats, confirmedSeats, Math.Max(0, admissionClass.TotalSeats - heldSeats - confirmedSeats));
    }
}
