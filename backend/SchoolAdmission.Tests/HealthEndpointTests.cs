using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace SchoolAdmission.Tests;

public sealed class HealthEndpointTests : IClassFixture<ApiWithoutExpirationWorkerFactory>
{
    private readonly ApiWithoutExpirationWorkerFactory factory;

    public HealthEndpointTests(ApiWithoutExpirationWorkerFactory factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task GetHealth_ReturnsOkWithHealthyStatus()
    {
        using var client = factory.CreateClient();
        using var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("healthy", body.GetProperty("status").GetString());
    }
}
