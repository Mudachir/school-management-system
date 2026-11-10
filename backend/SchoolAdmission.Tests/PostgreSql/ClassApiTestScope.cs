using System.Data.Common;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SchoolAdmission.Api.Data;

namespace SchoolAdmission.Tests.PostgreSql;

internal sealed class ClassApiTestScope : IAsyncDisposable
{
    private readonly WebApplicationFactory<Program> factory;
    private readonly RequestQueryCounter counter;

    private ClassApiTestScope(AppDbContext database, WebApplicationFactory<Program> factory,
        HttpClient client, RequestQueryCounter counter)
    {
        Database = database;
        this.factory = factory;
        Client = client;
        this.counter = counter;
    }

    public AppDbContext Database { get; }
    public HttpClient Client { get; }
    public int RequestQueryCount => counter.Count;
    public void ResetQueryCount() => counter.Reset();

    public static async Task<ClassApiTestScope> CreateAsync(PostgresFixture fixture)
    {
        // Reuse the existing exact test-database name guard and migration setup.
        var database = await fixture.CreateTransactionalContextAsync();
        var counter = new RequestQueryCounter();
        var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<AppDbContext>();
                services.AddScoped(_ =>
                {
                    var options = new DbContextOptionsBuilder<AppDbContext>()
                        .UseNpgsql(database.Database.GetDbConnection()).AddInterceptors(counter).Options;
                    var context = new AppDbContext(options);
                    context.Database.UseTransaction(database.Database.CurrentTransaction!.GetDbTransaction());
                    return context;
                });
            }));

        try
        {
            // Give list/empty-list assertions a clean view inside this transaction.
            // These deletes and every HTTP write roll back; persistent rows are retained.
            await database.AdmissionHolds.ExecuteDeleteAsync();
            await database.AdmissionClasses.ExecuteDeleteAsync();
            return new ClassApiTestScope(database, factory, factory.CreateClient(), counter);
        }
        catch
        {
            await factory.DisposeAsync();
            await database.DisposeAsync();
            throw;
        }
    }

    public async ValueTask DisposeAsync()
    {
        Client.Dispose();
        await factory.DisposeAsync();
        await Database.DisposeAsync();
    }

    private sealed class RequestQueryCounter : DbCommandInterceptor
    {
        private int count;
        public int Count => Volatile.Read(ref count);
        public void Reset() => Interlocked.Exchange(ref count, 0);

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref count);
            return ValueTask.FromResult(result);
        }
    }
}
