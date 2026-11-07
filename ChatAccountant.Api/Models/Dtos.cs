using System.Text.Json;
using System.Text.Json.Serialization;

namespace ChatAccountant.Api.Models;

public record ApiError(string Message);

public record GoogleLoginRequest(string AccessToken);
public record PhoneRequest(string Phone);
public record VerifyPhoneRequest(string Phone, string Code);
public record AuthResponse(string Token, UserDto User);

public record UserDto(
    string Id, string Name, string GivenName, string FamilyName, string Email, string Phone,
    bool EmailVerified, string? Picture, string? Locale, string Provider, DateTime CreatedAt, DateTime LastSignInAt)
{
    public static UserDto From(AppUser u) => new(
        u.Id.ToString(), u.Name, u.GivenName, u.FamilyName, u.Email, u.Phone ?? "",
        u.EmailVerified, u.Picture, u.Locale, "google",
        DateTime.SpecifyKind(u.CreatedAt, DateTimeKind.Utc), DateTime.SpecifyKind(u.LastSignInAt, DateTimeKind.Utc));
}

/// <summary>Ledger entry exactly as the browser app sends/reads it. Unknown fields travel in <see cref="Extra"/>.</summary>
public class LedgerEntryDto
{
    public string? Id { get; set; }
    public string Date { get; set; } = "";
    public string Type { get; set; } = "";
    public string? Category { get; set; }
    public string? Account { get; set; }
    public string? Description { get; set; }
    public decimal Amount { get; set; }
    public string? Party { get; set; }
    public decimal? TaxableAmount { get; set; }
    public decimal? GstPercent { get; set; }
    public decimal? GstAmount { get; set; }
    public JsonElement? TaxSplit { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? Extra { get; set; }
}

public record SendShareRequest(string Kind, string ToPhone, JsonElement Payload);
public record RespondShareRequest(string Status);

public record ShareDto(
    string Id, string Kind, string Status, string FromPhone, string ToPhone,
    DateTime CreatedAt, DateTime? RespondedAt, JsonElement Payload, string? NotifyStatus = null)
{
    public static ShareDto From(Share s, string? notifyStatus = null) => new(
        s.Id.ToString(), s.Kind, s.Status, s.FromPhone, s.ToPhone,
        DateTime.SpecifyKind(s.CreatedAt, DateTimeKind.Utc),
        s.RespondedAt is null ? null : DateTime.SpecifyKind(s.RespondedAt.Value, DateTimeKind.Utc),
        JsonSerializer.Deserialize<JsonElement>(s.PayloadJson), notifyStatus);
}

public record BusinessProfileDto(string Name, string Address, string State, string GstNumber);
