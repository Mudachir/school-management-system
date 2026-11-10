using System.Data;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Domain;

namespace SchoolAdmission.Api.Background;

public sealed class HoldExpirationSweep(AppDbContext context, TimeProvider timeProvider)
{
    public const int CandidateBatchSize = 256;
    public const int ClassBatchSize = 32;
    public const int HoldBatchSize = 256;

    public async Task<int> RunAsync(CancellationToken cancellationToken)
    {
        var discoveryUtc = timeProvider.GetUtcNow().UtcDateTime;
        // Index-friendly, bounded scalar discovery. No hold rows are locked here.
        var candidates = await context.AdmissionHolds.AsNoTracking()
            .Where(hold => hold.Status == HoldStatus.Held && hold.ExpiresAt <= discoveryUtc)
            .OrderBy(hold => hold.ExpiresAt).Select(hold => hold.ClassId)
            .Take(CandidateBatchSize).ToListAsync(cancellationToken);

        var expiredCount = 0;
        foreach (var classId in candidates.Distinct().Take(ClassBatchSize))
        {
            cancellationToken.ThrowIfCancellationRequested();
            await using var transaction = await context.Database.BeginTransactionAsync(
                IsolationLevel.ReadCommitted, cancellationToken);
            if (await ClassRowLock.AcquireAsync(context, classId, cancellationToken) is null)
                continue;

            // Discovery can be stale and lock waits can cross expiry boundaries.
            var decisionUtc = timeProvider.GetUtcNow().UtcDateTime;
            var elapsed = context.AdmissionHolds.Where(hold => hold.ClassId == classId &&
                hold.Status == HoldStatus.Held && hold.ExpiresAt <= decisionUtc);
            var holdIds = elapsed.OrderBy(hold => hold.ExpiresAt).Select(hold => hold.Id).Take(HoldBatchSize);
            // Keep status/expiry predicates on the UPDATE itself, not just discovery.
            var changed = await elapsed.Where(hold => holdIds.Contains(hold.Id))
                .ExecuteUpdateAsync(setters => setters.SetProperty(hold => hold.Status, HoldStatus.Expired),
                    cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            expiredCount += changed;
        }
        return expiredCount;
    }
}
