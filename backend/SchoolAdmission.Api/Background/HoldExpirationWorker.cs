using Microsoft.Extensions.Options;
using Npgsql;
using SchoolAdmission.Api.Configuration;

namespace SchoolAdmission.Api.Background;

public sealed class HoldExpirationWorker(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    IOptions<HoldExpirationOptions> options,
    ILogger<HoldExpirationWorker> logger) : BackgroundService
{
    // Resolve validated configuration outside the recoverable cycle-error handler.
    private readonly TimeSpan pollInterval = TimeSpan.FromSeconds(options.Value.PollSeconds);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var sweep = scope.ServiceProvider.GetRequiredService<HoldExpirationSweep>();
                var expiredCount = await sweep.RunAsync(stoppingToken);
                logger.LogDebug("Hold expiration sweep completed. ExpiredCount: {ExpiredCount}.", expiredCount);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                var sqlState = exception is PostgresException postgres ? postgres.SqlState :
                    exception.InnerException is PostgresException inner ? inner.SqlState : "n/a";
                // Exception messages/details may contain credentials or student IDs.
                // Log safe diagnostics on EVERY failed cycle, including persistent failures.
                logger.LogError("Hold expiration sweep failed. ErrorType: {ErrorType}; SqlState: {SqlState}. Next cycle will retry.",
                    exception.GetType().FullName, sqlState);
            }

            try
            {
                // Wait after work/errors rather than spinning or overlapping cycles.
                await Task.Delay(pollInterval, timeProvider, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }
}
