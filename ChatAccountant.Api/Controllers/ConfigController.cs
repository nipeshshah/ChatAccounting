using System.Text.Json;
using ChatAccountant.Api.Data;
using ChatAccountant.Api.Models;
using ChatAccountant.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChatAccountant.Api.Controllers;

/// <summary>The whole app settings object (categories, accounts, debtors, creditors, GST rates, shop profile...), stored as JSON.</summary>
[ApiController]
[Authorize]
[Route("api/config")]
public class ConfigController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var uid = User.GetUserId();
        var row = await db.UserConfigs.AsNoTracking().FirstOrDefaultAsync(c => c.UserId == uid, ct);
        return row is null ? NoContent() : Content(row.ConfigJson, "application/json");   // 204 = first-time user
    }

    [HttpPut]
    public async Task<IActionResult> Put([FromBody] JsonElement body, CancellationToken ct)
    {
        if (body.ValueKind != JsonValueKind.Object) return BadRequest(new ApiError("Config must be a JSON object."));
        var json = body.GetRawText();
        if (json.Length > 1_000_000) return StatusCode(413, new ApiError("Settings are too large."));

        var uid = User.GetUserId();
        var row = await db.UserConfigs.FirstOrDefaultAsync(c => c.UserId == uid, ct);
        if (row is null) db.UserConfigs.Add(new UserConfig { UserId = uid, ConfigJson = json, UpdatedAt = DateTime.UtcNow });
        else { row.ConfigJson = json; row.UpdatedAt = DateTime.UtcNow; }
        await db.SaveChangesAsync(ct);
        return Content(json, "application/json");
    }
}
