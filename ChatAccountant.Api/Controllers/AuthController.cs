using System.Security.Cryptography;
using System.Text;
using ChatAccountant.Api.Data;
using ChatAccountant.Api.Models;
using ChatAccountant.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace ChatAccountant.Api.Controllers;

[ApiController]
[Route("api/auth")]
[EnableRateLimiting("auth")]
public class AuthController(
    AppDbContext db, ITokenService tokens, IGoogleAuthService google, IOtpSender otp,
    IConfiguration cfg, IHostEnvironment env) : ControllerBase
{
    private const int MaxOtpAttempts = 5;

    /// <summary>Exchange a Google access token (from the browser pop-up) for this API's own JWT.</summary>
    [HttpPost("google")]
    public async Task<IActionResult> GoogleLogin(GoogleLoginRequest req, CancellationToken ct)
    {
        var profile = await google.ValidateAsync(req.AccessToken, ct);
        if (profile is null) return Unauthorized(new ApiError("Google sign-in couldn't be verified."));
        var user = await UpsertAsync(profile, ct);
        return Ok(new AuthResponse(tokens.Create(user), UserDto.From(user)));
    }

    /// <summary>Development-only shortcut so you can run the app before Google is configured.</summary>
    [HttpPost("dev")]
    public async Task<IActionResult> DevLogin(CancellationToken ct)
    {
        if (!env.IsDevelopment() || !cfg.GetValue<bool>("Auth:AllowDevLogin")) return NotFound();
        var profile = new GoogleProfile("dev|demo-user", "demo.user@example.com", true, "Demo User", "Demo", "User", null, "en-IN");
        var user = await UpsertAsync(profile, ct);
        return Ok(new AuthResponse(tokens.Create(user), UserDto.From(user)));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == User.GetUserId(), ct);
        return user is null ? Unauthorized() : Ok(UserDto.From(user));
    }

    /// <summary>Step 1 of linking a mobile number: text a 6-digit code.</summary>
    [Authorize]
    [HttpPost("phone/send")]
    public async Task<IActionResult> SendOtp(PhoneRequest req, CancellationToken ct)
    {
        var uid = User.GetUserId();
        var phone = PhoneUtil.Normalize(req.Phone);
        if (phone == "") return BadRequest(new ApiError("Enter a valid mobile number, e.g. +91 98765 43210."));
        if (await db.Users.AnyAsync(u => u.Phone == phone && u.Id != uid, ct))
            return Conflict(new ApiError("That number is already linked to another account."));

        var since = DateTime.UtcNow.AddHours(-1);
        if (await db.PhoneOtps.CountAsync(o => o.UserId == uid && o.CreatedAt > since, ct) >= 5)
            return StatusCode(429, new ApiError("Too many codes requested. Please try again in an hour."));

        var fixedCode = cfg["Otp:FixedCode"];
        var code = !string.IsNullOrWhiteSpace(fixedCode) && env.IsDevelopment()
            ? fixedCode!
            : RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");

        db.PhoneOtps.Add(new PhoneOtp { UserId = uid, Phone = phone, CodeHash = Hash(uid, phone, code), ExpiresAt = DateTime.UtcNow.AddMinutes(10) });
        await db.SaveChangesAsync(ct);
        await otp.SendAsync(phone, code, ct);
        return Ok(new { phone });
    }

    /// <summary>Step 2: confirm the code; the number then becomes this account's verified mobile.</summary>
    [Authorize]
    [HttpPost("phone/verify")]
    public async Task<IActionResult> VerifyOtp(VerifyPhoneRequest req, CancellationToken ct)
    {
        var uid = User.GetUserId();
        var phone = PhoneUtil.Normalize(req.Phone);
        if (phone == "") return BadRequest(new ApiError("Enter a valid mobile number."));

        var now = DateTime.UtcNow;
        var row = await db.PhoneOtps
            .Where(o => o.UserId == uid && o.Phone == phone && !o.Used && o.ExpiresAt > now)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefaultAsync(ct);
        if (row is null) return BadRequest(new ApiError("Request a code for this number first (codes expire after 10 minutes)."));
        if (row.Attempts >= MaxOtpAttempts) return StatusCode(429, new ApiError("Too many wrong attempts. Request a new code."));

        row.Attempts++;
        var expected = Encoding.UTF8.GetBytes(row.CodeHash);
        var actual = Encoding.UTF8.GetBytes(Hash(uid, phone, (req.Code ?? "").Trim()));
        if (!CryptographicOperations.FixedTimeEquals(expected, actual))
        {
            await db.SaveChangesAsync(ct);
            return BadRequest(new ApiError("Wrong code. Please try again."));
        }

        row.Used = true;
        var user = await db.Users.FirstAsync(u => u.Id == uid, ct);
        user.Phone = phone;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (DbErrors.IsUniqueViolation(ex))
        {
            return Conflict(new ApiError("That number is already linked to another account."));
        }
        return Ok(UserDto.From(user));
    }

    private async Task<AppUser> UpsertAsync(GoogleProfile p, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var user = await db.Users.FirstOrDefaultAsync(u => u.GoogleSubject == p.Subject, ct);
        if (user is null)
        {
            user = new AppUser { GoogleSubject = p.Subject, CreatedAt = now };
            db.Users.Add(user);
        }
        user.Email = p.Email;
        user.EmailVerified = p.EmailVerified;
        user.Name = p.Name;
        user.GivenName = p.GivenName ?? p.Name.Split(' ')[0];
        user.FamilyName = p.FamilyName ?? "";
        user.Picture = p.Picture;
        user.Locale = p.Locale;
        user.LastSignInAt = now;
        await db.SaveChangesAsync(ct);
        return user;
    }

    private string Hash(Guid uid, string phone, string code) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{uid}|{phone}|{code}|{cfg["Jwt:Key"]}")));
}
