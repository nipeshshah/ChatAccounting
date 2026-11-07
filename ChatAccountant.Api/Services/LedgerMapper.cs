using System.Globalization;
using System.Text.Json;
using ChatAccountant.Api.Models;

namespace ChatAccountant.Api.Services;

public static class LedgerMapper
{
    private static string Cut(string? s, int max) { s ??= ""; return s.Length <= max ? s : s[..max]; }

    public static LedgerEntry? FromDto(LedgerEntryDto d, Guid userId, out string? error)
    {
        error = null;
        if (!DateOnly.TryParseExact(d.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        { error = "Invalid date."; return null; }

        var type = (d.Type ?? "").Trim().ToLowerInvariant();
        if (type != "income" && type != "expense") { error = "Type must be income or expense."; return null; }

        if (d.Amount <= -1_000_000_000_000m || d.Amount >= 1_000_000_000_000m) { error = "This transaction has no valid amount."; return null; }
        if (d.GstPercent is < 0 or > 999) { error = "Invalid GST percent."; return null; }

        string? shareId = null;
        Dictionary<string, JsonElement>? extra = null;
        if (d.Extra is not null)
        {
            foreach (var kv in d.Extra)
            {
                if (kv.Key == "shareId")
                {
                    if (kv.Value.ValueKind == JsonValueKind.String) shareId = Cut(kv.Value.GetString(), 64);
                    continue;
                }
                (extra ??= new())[kv.Key] = kv.Value;
            }
        }
        var extraJson = extra is null ? null : JsonSerializer.Serialize(extra);
        if (extraJson is { Length: > 8000 }) { error = "Entry has too much extra data."; return null; }

        return new LedgerEntry
        {
            UserId = userId,
            EntryDate = date,
            Type = type,
            Category = Cut(d.Category, 200),
            Account = Cut(d.Account, 200),
            Description = Cut(d.Description, 1000),
            Amount = Math.Round(d.Amount, 2),
            Party = d.Party is null ? null : Cut(d.Party, 200),
            TaxableAmount = d.TaxableAmount is null ? null : Math.Round(d.TaxableAmount.Value, 2),
            GstPercent = d.GstPercent,
            GstAmount = d.GstAmount is null ? null : Math.Round(d.GstAmount.Value, 2),
            TaxSplitJson = d.TaxSplit is { ValueKind: JsonValueKind.Object } ts ? ts.GetRawText() : null,
            ExtraJson = extraJson,
            ShareId = shareId
        };
    }

    public static LedgerEntryDto ToDto(LedgerEntry e)
    {
        Dictionary<string, JsonElement>? extra = null;
        if (!string.IsNullOrEmpty(e.ExtraJson))
            extra = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(e.ExtraJson);
        if (e.ShareId is not null)
        {
            extra ??= new();
            extra["shareId"] = JsonSerializer.SerializeToElement(e.ShareId);
        }

        JsonElement? taxSplit = null;
        if (!string.IsNullOrEmpty(e.TaxSplitJson))
            taxSplit = JsonSerializer.Deserialize<JsonElement>(e.TaxSplitJson);

        return new LedgerEntryDto
        {
            Id = e.Id.ToString(),
            Date = e.EntryDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            Type = e.Type,
            Category = e.Category,
            Account = e.Account,
            Description = e.Description,
            Amount = e.Amount,
            Party = e.Party,
            TaxableAmount = e.TaxableAmount,
            GstPercent = e.GstPercent,
            GstAmount = e.GstAmount,
            TaxSplit = taxSplit,
            Extra = extra
        };
    }
}
