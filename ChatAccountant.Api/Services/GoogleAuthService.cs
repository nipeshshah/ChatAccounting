using System.Net.Http.Headers;
using System.Text.Json;

namespace ChatAccountant.Api.Services;

public record GoogleProfile(string Subject, string Email, bool EmailVerified, string Name, string? GivenName, string? FamilyName, string? Picture, string? Locale);

public interface IGoogleAuthService { Task<GoogleProfile?> ValidateAsync(string accessToken, CancellationToken ct); }

/// <summary>Verifies a Google OAuth access token was issued to OUR client id, then reads the user's profile.</summary>
public class GoogleAuthService(HttpClient http, IConfiguration cfg, ILogger<GoogleAuthService> log) : IGoogleAuthService
{
    public async Task<GoogleProfile?> ValidateAsync(string accessToken, CancellationToken ct)
    {
        var clientId = cfg["Google:ClientId"];
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(accessToken)) return null;
        try
        {
            using var infoRes = await http.GetAsync("https://oauth2.googleapis.com/tokeninfo?access_token=" + Uri.EscapeDataString(accessToken), ct);
            if (!infoRes.IsSuccessStatusCode) return null;
            using var info = JsonDocument.Parse(await infoRes.Content.ReadAsStringAsync(ct));
            var aud = Str(info.RootElement, "aud");
            var azp = Str(info.RootElement, "azp");
            if (aud != clientId && azp != clientId) { log.LogWarning("Google token was issued to a different client."); return null; }

            using var req = new HttpRequestMessage(HttpMethod.Get, "https://www.googleapis.com/oauth2/v3/userinfo");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            using var res = await http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode) return null;
            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
            var u = doc.RootElement;

            var sub = Str(u, "sub");
            var email = Str(u, "email");
            if (string.IsNullOrEmpty(sub) || string.IsNullOrEmpty(email)) return null;
            var verified = u.TryGetProperty("email_verified", out var v) &&
                           (v.ValueKind == JsonValueKind.True || (v.ValueKind == JsonValueKind.String && v.GetString() == "true"));
            var name = Str(u, "name");
            return new GoogleProfile(sub, email, verified, string.IsNullOrEmpty(name) ? email.Split('@')[0] : name,
                Str(u, "given_name"), Str(u, "family_name"), Str(u, "picture"), Str(u, "locale"));
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Google token validation failed.");
            return null;
        }
    }

    private static string? Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
}
