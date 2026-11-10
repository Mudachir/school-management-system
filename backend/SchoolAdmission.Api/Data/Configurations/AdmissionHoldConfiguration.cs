using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SchoolAdmission.Api.Domain;

namespace SchoolAdmission.Api.Data.Configurations;

public sealed class AdmissionHoldConfiguration : IEntityTypeConfiguration<AdmissionHold>
{
    public void Configure(EntityTypeBuilder<AdmissionHold> builder)
    {
        builder.ToTable("AdmissionHolds", table =>
        {
            table.HasCheckConstraint("CK_AdmissionHolds_StudentId", "\"StudentId\" ~ '^[0-9]{17}$'");
            table.HasCheckConstraint("CK_AdmissionHolds_Status",
                "\"Status\" IN ('HELD', 'CONFIRMED', 'EXPIRED', 'CANCELLED')");
        });
        builder.HasKey(hold => hold.Id);
        builder.Property(hold => hold.Id).ValueGeneratedNever();
        builder.Property(hold => hold.StudentId).HasColumnType("varchar(17)").IsRequired();
        builder.Property(hold => hold.Status)
            .HasConversion(status => status.ToString().ToUpperInvariant(),
                value => Enum.Parse<HoldStatus>(value, true))
            .HasColumnType("varchar(20)").IsRequired();
        builder.Property(hold => hold.CreatedAt).HasColumnType("timestamptz");
        builder.Property(hold => hold.ExpiresAt).HasColumnType("timestamptz");
        builder.Property(hold => hold.ConfirmedAt).HasColumnType("timestamptz");
        builder.Property(hold => hold.CancelledAt).HasColumnType("timestamptz");

        builder.HasOne(hold => hold.Class).WithMany().HasForeignKey(hold => hold.ClassId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(hold => new { hold.StudentId, hold.ClassId })
            .HasDatabaseName("UX_AdmissionHolds_StudentId_ClassId_Active")
            .IsUnique().HasFilter("\"Status\" IN ('HELD', 'CONFIRMED')");
        builder.HasIndex(hold => new { hold.Status, hold.ExpiresAt });
        builder.HasIndex(hold => new { hold.StudentId, hold.CreatedAt }).IsDescending(false, true);
    }
}
