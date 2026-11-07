using System.Text.Json;
using ChatAccountant.Api.Data;
using ChatAccountant.Api.Models;
using ChatAccountant.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChatAccountant.Api.Controllers;

/// <summary>
/// Transaction requests between users. A request is only a row here; nothing is ever written into
/// another user's ledger. The recipient is whoever has VERIFIED the number in <c>ToPhone</c>.
/// </summary>
[ApiController]
[Authorize]
[Route("api/shares")]
public class SharesController(AppDbContext db, IShareNotifier notifier) : ControllerBase
{
    private static readonly string[] Kinds = ["sale", "purchase", "received", "paid", "discount_allowed", "discount_received"];

    [HttpPost]
    public async Task<IActionResult> Send(SendShareRequest req, CancellationToken ct)
    {
        if (!Kinds.Contains(req.Kind) || req.Payload.ValueKind != JsonValueKind.Object) return BadRequest(new ApiError("Incomplete request."));
        var toPhone = PhoneUtil.Normalize(req.ToPhone);
        if (toPhone == "") return BadRequest(new ApiError("That mobile number doesn't look right."));
        var payload = req.Payload.GetRawText();
        if (payload.Length >= 16000) return BadRequest(new ApiError("Request is too large."));

        var me = await db.Users.AsNoTracking().FirstAsync(u => u.Id == User.GetUserId(), ct);
        if (string.IsNullOrEmpty(me.Phone))
            return BadRequest(new ApiError("Verify your own mobile number in the Profile tab before sending requests."));

        var share = new Share { FromUserId = me.Id, FromPhone = me.Phone, ToPhone = toPhone, Kind = req.Kind, PayloadJson = payload };
        db.Shares.Add(share);
        await db.SaveChangesAsync(ct);

        var status = await notifier.NotifyAsync(share, ct);
        if (status == "sent") { share.NotifiedAt = DateTime.UtcNow; await db.SaveChangesAsync(ct); }
        return Ok(ShareDto.From(share, status));
    }

    /// <summary>Pending requests addressed to the signed-in user's verified number.</summary>
    [HttpGet("incoming")]
    public async Task<IActionResult> Incoming(CancellationToken ct)
    {
        var me = await db.Users.AsNoTracking().FirstAsync(u => u.Id == User.GetUserId(), ct);
        if (string.IsNullOrEmpty(me.Phone)) return Ok(Array.Empty<ShareDto>());
        var rows = await db.Shares.AsNoTracking()
            .Where(s => s.ToPhone == me.Phone && s.Status == ShareStatus.Pending)
            .OrderBy(s => s.CreatedAt).Take(200).ToListAsync(ct);
        return Ok(rows.Select(s => ShareDto.From(s)));
    }

    [HttpGet("outgoing")]
    public async Task<IActionResult> Outgoing(CancellationToken ct)
    {
        var uid = User.GetUserId();
        var rows = await db.Shares.AsNoTracking().Where(s => s.FromUserId == uid)
            .OrderByDescending(s => s.CreatedAt).Take(100).ToListAsync(ct);
        return Ok(rows.Select(s => ShareDto.From(s)));
    }

    /// <summary>Accept / reject. Only the recipient, only while pending, only once (atomic UPDATE).</summary>
    [HttpPost("{id:guid}/respond")]
    public async Task<IActionResult> Respond(Guid id, RespondShareRequest req, CancellationToken ct)
    {
        if (req.Status != ShareStatus.Accepted && req.Status != ShareStatus.Rejected) return BadRequest(new ApiError("Invalid response."));
        var me = await db.Users.AsNoTracking().FirstAsync(u => u.Id == User.GetUserId(), ct);
        var phone = me.Phone;
        if (string.IsNullOrEmpty(phone)) return Conflict(new ApiError("Verify your mobile number first."));

        var now = DateTime.UtcNow;
        var changed = await db.Shares
            .Where(s => s.Id == id && s.Status == ShareStatus.Pending && s.ToPhone == phone)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, req.Status).SetProperty(x => x.RespondedAt, (DateTime?)now), ct);
        if (changed == 0) return Conflict(new ApiError("This request was already answered or no longer exists."));

        var share = await db.Shares.AsNoTracking().FirstAsync(s => s.Id == id, ct);
        return Ok(ShareDto.From(share));
    }
}
