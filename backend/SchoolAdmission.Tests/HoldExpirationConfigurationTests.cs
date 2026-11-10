using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SchoolAdmission.Api.Background;
using SchoolAdmission.Api.Configuration;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Tests.PostgreSql;

namespace SchoolAdmission.Tests;

public sealed class HoldExpirationConfigurationTests
{
    private static IHost BuildHost(string? interval, ExpirationLogProbe? logs = null)
    {
        var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings { EnvironmentName = Environments.Development });
        builder.Configuration.Sources.Clear();
        if (interval is not null)
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
                { ["HOLD_EXPIRATION_POLL_SECONDS"] = interval });
        builder.Logging.ClearProviders();
        if (logs is not null) builder.Logging.AddProvider(logs);
        // Configuration tests never open this connection.
        builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql("Host=127.0.0.1;Database=unused"));
        builder.Services.AddHoldExpiration(builder.Configuration);
        return builder.Build();
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("4294968")]
    public async Task Startup_RejectsOutOfRangePollIntervals(string interval)
    {
        using var host = BuildHost(interval);
        var error = await Assert.ThrowsAsync<OptionsValidationException>(() => host.StartAsync());
        Assert.Contains("HOLD_EXPIRATION_POLL_SECONDS", error.Message);
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("1.5")]
    [InlineData("2147483648")]
    public async Task Startup_RejectsNonIntegerPollIntervals(string interval)
    {
        using var host = BuildHost(interval);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => host.StartAsync());
        Assert.Contains("HOLD_EXPIRATION_POLL_SECONDS", error.Message);
    }

    [Theory]
    [InlineData(null, 5)]
    [InlineData("1", 1)]
    [InlineData("4294967", HoldExpirationOptions.MaximumPollSeconds)]
    public void Options_AcceptDefaultAndSupportedPositiveBoundaries(string? interval, int expected)
    {
        using var host = BuildHost(interval);
        Assert.Equal(expected, host.Services.GetRequiredService<IOptions<HoldExpirationOptions>>().Value.PollSeconds);
    }

    [Fact]
    public async Task CycleErrors_AreLoggedWithoutRawExceptionSecrets()
    {
        var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings { EnvironmentName = Environments.Development });
        builder.Configuration.Sources.Clear();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["HOLD_EXPIRATION_POLL_SECONDS"] = "1" });
        var logs = new ExpirationLogProbe();
        builder.Logging.ClearProviders().AddProvider(logs);
        builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql("Host=127.0.0.1;Database=unused"));
        builder.Services.AddHoldExpiration(builder.Configuration);
        const string sensitive = "StudentId=01234567890123456;Password=must-not-be-logged";
        builder.Services.AddScoped<HoldExpirationSweep>(_ => throw new InvalidOperationException(sensitive));
        using var host = builder.Build();
        await host.StartAsync();
        try
        {
            await ExpirationTestHost.EventuallyAsync(() => Task.FromResult(logs.Entries.Any(entry => entry.Level == LogLevel.Error)));
            var messages = string.Join("\n", logs.Entries.Select(entry => entry.Message));
            Assert.Contains(nameof(InvalidOperationException), messages);
            Assert.DoesNotContain("01234567890123456", messages);
            Assert.DoesNotContain("must-not-be-logged", messages);
            var worker = host.Services.GetServices<IHostedService>().OfType<HoldExpirationWorker>().Single();
            Assert.False(worker.ExecuteTask!.IsCompleted);
        }
        finally { await host.StopAsync().WaitAsync(TimeSpan.FromSeconds(3)); }
    }
}
