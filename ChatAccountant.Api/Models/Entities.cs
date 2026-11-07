namespace ChatAccountant.Api.Models;

public class AppUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string GoogleSubject { get; set; } = "";
    public string Email { get; set; } = "";
    public string Name { get; set; } = "";
    public string GivenName { get; set; } = "";
    public string FamilyName { get; set; } = "";
    public string? Picture { get; set; }
    public bool EmailVerified { get; set; }
    public string? Locale { get; set; }
    /// <summary>Verified mobile number, E.164 (+919876543210). Unique across accounts.</summary>
    public string? Phone { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastSignInAt { get; set; } = DateTime.UtcNow;
}

/// <summary>One settings row per user. The whole app config object is stored as JSON.</summary>
public class UserConfig
{
    public Guid UserId { get; set; }
    public string ConfigJson { get; set; } = "{}";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class LedgerEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// <summary>Identity column - keeps insertion order.</summary>
    public long Seq { get; set; }
    public Guid UserId { get; set; }
    public DateOnly EntryDate { get; set; }
    public string Type { get; set; } = "";          // income | expense
    public string Category { get; set; } = "";
    public string Account { get; set; } = "";
    public string Description { get; set; } = "";
    public decimal Amount { get; set; }
    public string? Party { get; set; }
    public decimal? TaxableAmount { get; set; }
    public decimal? GstPercent { get; set; }
    public decimal? GstAmount { get; set; }
    public string? TaxSplitJson { get; set; }
    /// <summary>Any extra field the app adds later, so nothing is dropped.</summary>
    public string? ExtraJson { get; set; }
    /// <summary>Id of the accepted request that created this entry (unique per user: accepting twice cannot double-book).</summary>
    public string? ShareId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public static class ShareStatus
{
    public const string Pending = "pending";
    public const string Accepted = "accepted";
    public const string Rejected = "rejected";
}

/// <summary>A transaction one user proposes to another user's books. Nothing is written to the recipient until they accept.</summary>
public class Share
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FromUserId { get; set; }
    public string FromPhone { get; set; } = "";
    public string ToPhone { get; set; } = "";
    public string Kind { get; set; } = "";          // from the SENDER's side
    public string Status { get; set; } = ShareStatus.Pending;
    public string PayloadJson { get; set; } = "{}";
    public DateTime? NotifiedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? RespondedAt { get; set; }
}

public class PhoneOtp
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Phone { get; set; } = "";
    public string CodeHash { get; set; } = "";
    public int Attempts { get; set; }
    public bool Used { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
