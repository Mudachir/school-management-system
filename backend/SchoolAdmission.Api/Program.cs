using SchoolAdmission.Api.Configuration;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOptions<HoldOptions>()
    .Bind(builder.Configuration)
    .Validate(options => options.DurationSeconds > 0,
        "HOLD_DURATION_SECONDS must be a positive integer.")
    .ValidateOnStart();

var app = builder.Build();

app.MapControllers();
app.Run();

public partial class Program { }
