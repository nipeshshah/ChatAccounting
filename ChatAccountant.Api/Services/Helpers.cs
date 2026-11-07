using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

namespace ChatAccountant.Api.Services;

public static class ClaimsExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal user)
    {
        var raw = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return Guid.TryParse(raw, out var id) ? id : Guid.Empty;
    }
}

public static class PhoneUtil
{
    /// <summary>Same rules as the browser: bare 10-digit and 0-prefixed 11-digit numbers are Indian mobiles. Returns "" if invalid.</summary>
    public static string Normalize(string? v)
    {
        var s = (v ?? "").Trim();
        if (s.Length == 0) return "";
        var d = Regex.Replace(s, @"\D", "");
        if (s[0] != '+')
        {
            if (d.Length == 11 && d[0] == '0') d = "91" + d[1..];
            else if (d.Length == 10) d = "91" + d;
        }
        return Regex.IsMatch(d, @"^[1-9]\d{7,14}$") ? "+" + d : "";
    }
}

public static class DbErrors
{
    /// <summary>SQL Server duplicate-key errors (unique index / primary key).</summary>
    public static bool IsUniqueViolation(DbUpdateException ex) =>
        ex.InnerException is Microsoft.Data.SqlClient.SqlException s && (s.Number == 2601 || s.Number == 2627);
}
