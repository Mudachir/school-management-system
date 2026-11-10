using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Domain;

namespace SchoolAdmission.Api.Data;

internal static class ClassRowLock
{
    public static async Task<AdmissionClass?> AcquireAsync(
        AppDbContext context, Guid classId, CancellationToken cancellationToken)
    {
        if (context.Database.CurrentTransaction is null)
            throw new InvalidOperationException("A transaction is required to lock a class row.");

        // Materialize the targeted SQL directly; do not compose over FOR UPDATE.
        var classes = await context.AdmissionClasses.FromSqlInterpolated($"""
            SELECT * FROM "AdmissionClasses" WHERE "Id" = {classId} FOR UPDATE
            """).AsNoTracking().ToListAsync(cancellationToken);
        return classes.SingleOrDefault();
    }
}
