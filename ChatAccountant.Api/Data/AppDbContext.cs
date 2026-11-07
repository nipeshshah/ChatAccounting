using ChatAccountant.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ChatAccountant.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<UserConfig> UserConfigs => Set<UserConfig>();
    public DbSet<LedgerEntry> LedgerEntries => Set<LedgerEntry>();
    public DbSet<Share> Shares => Set<Share>();
    public DbSet<PhoneOtp> PhoneOtps => Set<PhoneOtp>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<AppUser>(e =>
        {
            e.ToTable("Users");
            e.Property(x => x.GoogleSubject).HasMaxLength(100).IsRequired();
            e.Property(x => x.Email).HasMaxLength(320);
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.GivenName).HasMaxLength(100);
            e.Property(x => x.FamilyName).HasMaxLength(100);
            e.Property(x => x.Picture).HasMaxLength(1000);
            e.Property(x => x.Locale).HasMaxLength(20);
            e.Property(x => x.Phone).HasMaxLength(20);
            e.HasIndex(x => x.GoogleSubject).IsUnique();
            e.HasIndex(x => x.Phone).IsUnique().HasFilter("[Phone] IS NOT NULL");   // a number belongs to one account
        });

        b.Entity<UserConfig>(e =>
        {
            e.ToTable("UserConfigs");
            e.HasKey(x => x.UserId);
            e.HasOne<AppUser>().WithOne().HasForeignKey<UserConfig>(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<LedgerEntry>(e =>
        {
            e.ToTable("LedgerEntries");
            e.Property(x => x.Seq).UseIdentityColumn();
            e.Property(x => x.Type).HasMaxLength(10).IsRequired();
            e.Property(x => x.Category).HasMaxLength(200);
            e.Property(x => x.Account).HasMaxLength(200);
            e.Property(x => x.Description).HasMaxLength(1000);
            e.Property(x => x.Party).HasMaxLength(200);
            e.Property(x => x.ShareId).HasMaxLength(64);
            e.Property(x => x.Amount).HasColumnType("decimal(14,2)");
            e.Property(x => x.TaxableAmount).HasColumnType("decimal(14,2)");
            e.Property(x => x.GstAmount).HasColumnType("decimal(14,2)");
            e.Property(x => x.GstPercent).HasColumnType("decimal(6,3)");
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.UserId, x.Seq });
            e.HasIndex(x => new { x.UserId, x.ShareId }).IsUnique().HasFilter("[ShareId] IS NOT NULL");
        });

        b.Entity<Share>(e =>
        {
            e.ToTable("Shares");
            e.Property(x => x.FromPhone).HasMaxLength(20).IsRequired();
            e.Property(x => x.ToPhone).HasMaxLength(20).IsRequired();
            e.Property(x => x.Kind).HasMaxLength(30).IsRequired();
            e.Property(x => x.Status).HasMaxLength(10).IsRequired();
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.FromUserId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.ToPhone, x.Status });
            e.HasIndex(x => new { x.FromUserId, x.CreatedAt });
        });

        b.Entity<PhoneOtp>(e =>
        {
            e.ToTable("PhoneOtps");
            e.Property(x => x.Phone).HasMaxLength(20).IsRequired();
            e.Property(x => x.CodeHash).HasMaxLength(100).IsRequired();
            e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.UserId, x.CreatedAt });
        });
    }
}
