using Microsoft.AspNetCore.StaticFiles;

// Serves the PWA (everything in wwwroot) over HTTPS. All app logic runs in the browser;
// data comes from ChatAccountant.Api (see wwwroot/js/config.js for its address).
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}
app.UseHttpsRedirection();

var types = new FileExtensionContentTypeProvider();
types.Mappings[".webmanifest"] = "application/manifest+json";

app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = types,
    OnPrepareResponse = ctx =>
    {
        // The service worker, page and manifest must always be revalidated so deployments reach users.
        var name = ctx.File.Name;
        if (name is "service-worker.js" or "index.html" or "manifest.webmanifest" or "config.js")
        {
            ctx.Context.Response.Headers.CacheControl = "no-cache";
        }
        if (name == "service-worker.js")
        {
            ctx.Context.Response.Headers["Service-Worker-Allowed"] = "/";
        }
    }
});

app.Run();
