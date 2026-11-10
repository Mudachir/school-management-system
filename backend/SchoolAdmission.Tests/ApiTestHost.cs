using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SchoolAdmission.Api.Background;

namespace SchoolAdmission.Tests;

internal static class ApiTestHost
{
    public static void DisableExpirationWorker(IServiceCollection services)
    {
        var registration = services.Single(descriptor => descriptor.ServiceType == typeof(IHostedService) &&
            descriptor.ImplementationType == typeof(HoldExpirationWorker));
        services.Remove(registration);
    }
}

public sealed class ApiWithoutExpirationWorkerFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.ConfigureTestServices(ApiTestHost.DisableExpirationWorker);
}
