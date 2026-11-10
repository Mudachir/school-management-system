using Microsoft.Extensions.DependencyInjection.Extensions;
using SchoolAdmission.Api.Configuration;

namespace SchoolAdmission.Api.Background;

public static class HoldExpirationRegistration
{
    public static IServiceCollection AddHoldExpiration(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<HoldExpirationOptions>().Bind(configuration)
            .Validate(options => options.PollSeconds is > 0 and <= HoldExpirationOptions.MaximumPollSeconds,
                "HOLD_EXPIRATION_POLL_SECONDS must be a positive integer no greater than 4294967 seconds.")
            .ValidateOnStart();
        services.TryAddSingleton<TimeProvider>(TimeProvider.System);
        services.AddScoped<HoldExpirationSweep>();
        services.AddHostedService<HoldExpirationWorker>();
        return services;
    }
}
