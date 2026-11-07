using ChatAccountant.Api.Data;
using ChatAccountant.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChatAccountant.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/account")]
public class AccountController(AppDbContext db) : ControllerBase
{
    /// <summary>Permanently deletes THIS user's transactions, settings and sent requests (never anyone else's).</summary>
    [HttpDelete("data")]
    public async Task<IActionResult> ResetData(CancellationToken ct)
    {
        var uid = User.GetUserId();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.LedgerEntries.Where(e => e.UserId == uid).ExecuteDeleteAsync(ct);
        await db.Shares.Where(s => s.FromUserId == uid).ExecuteDeleteAsync(ct);
        await db.UserConfigs.Where(c => c.UserId == uid).ExecuteDeleteAsync(ct);
        await tx.CommitAsync(ct);
        return NoContent();
    }
}
