using SchoolAdmission.Api.Configuration;
using SchoolAdmission.Api.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOptions<HoldOptions>()
    .Bind(builder.Configuration)
    .Validate(options => options.DurationSeconds > 0,
        "HOLD_DURATION_SECONDS must be a positive integer.")
    .ValidateOnStart();

// Resolve database configuration only when a context is requested. Liveness
// remains available without a database or connection string.
builder.Services.AddDbContext<AppDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        throw new InvalidOperationException(
            "Configure ConnectionStrings:DefaultConnection (ConnectionStrings__DefaultConnection) to use the database.");
    }

    options.UseNpgsql(connectionString);
});

var app = builder.Build();

app.MapControllers();
app.Run();

public partial class Program { }
