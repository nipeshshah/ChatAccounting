using System.Text.Json;
using ChatAccountant.Api.Data;
using ChatAccountant.Api.Models;
using ChatAccountant.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChatAccountant.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/profiles")]
public class ProfilesController(AppDbContext db) : ControllerBase
{
    /// <summary>
    /// Returns ONLY the shared business profile (name, address, state, GSTIN) of the account that owns this verified number.
    /// Requires the caller to have a verified number; owners can opt out (shop.discoverable = false); 204 when nothing is shared.
    /// </summary>
    [HttpGet("lookup")]
    public async Task<IActionResult> Lookup([FromQuery] string phone, CancellationToken ct)
    {
        var me = await db.Users.AsNoTracking().FirstAsync(u => u.Id == User.GetUserId(), ct);
        var p = PhoneUtil.Normalize(phone);
        if (string.IsNullOrEmpty(me.Phone) || p == "") return NoContent();

        var owner = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Phone == p, ct);
        if (owner is null) return NoContent();
        var cfg = await db.UserConfigs.AsNoTracking().FirstOrDefaultAsync(c => c.UserId == owner.Id, ct);
        if (cfg is null) return NoContent();

        try
        {
            using var doc = JsonDocument.Parse(cfg.ConfigJson);
            if (!doc.RootElement.TryGetProperty("shop", out var shop) || shop.ValueKind != JsonValueKind.Object) return NoContent();
            if (shop.TryGetProperty("discoverable", out var d) && d.ValueKind == JsonValueKind.False) return NoContent();
            var name = Str(shop, "name").Trim();
            if (name.Length == 0) return NoContent();
            return Ok(new BusinessProfileDto(name, Str(shop, "address"), Str(shop, "state"), Str(shop, "gstNumber")));
        }
        catch (JsonException) { return NoContent(); }
    }

    private static string Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
}
