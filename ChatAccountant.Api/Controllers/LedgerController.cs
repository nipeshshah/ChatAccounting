using ChatAccountant.Api.Data;
using ChatAccountant.Api.Models;
using ChatAccountant.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChatAccountant.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/ledger")]
public class LedgerController(AppDbContext db) : ControllerBase
{
    /// <summary>All of the signed-in user's entries, oldest first (order recorded).</summary>
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var uid = User.GetUserId();
        var rows = await db.LedgerEntries.AsNoTracking().Where(e => e.UserId == uid).OrderBy(e => e.Seq).ToListAsync(ct);
        return Ok(rows.Select(LedgerMapper.ToDto));
    }

    [HttpPost]
    public async Task<IActionResult> Add([FromBody] LedgerEntryDto dto, CancellationToken ct)
    {
        var entity = LedgerMapper.FromDto(dto, User.GetUserId(), out var error);
        if (entity is null) return BadRequest(new ApiError(error ?? "Invalid entry."));

        db.LedgerEntries.Add(entity);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (DbErrors.IsUniqueViolation(ex))
        {
            // the same accepted request was already recorded (double tap / second tab)
            return Conflict(new ApiError("This transaction was already recorded."));
        }
        return Ok(LedgerMapper.ToDto(entity));
    }
}
