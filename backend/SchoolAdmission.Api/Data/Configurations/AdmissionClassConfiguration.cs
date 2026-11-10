using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SchoolAdmission.Api.Domain;

namespace SchoolAdmission.Api.Data.Configurations;

public sealed class AdmissionClassConfiguration : IEntityTypeConfiguration<AdmissionClass>
{
    public void Configure(EntityTypeBuilder<AdmissionClass> builder)
    {
        builder.ToTable("AdmissionClasses", table =>
            table.HasCheckConstraint("CK_AdmissionClasses_TotalSeats", "\"TotalSeats\" > 0"));
        builder.HasKey(admissionClass => admissionClass.Id);
        builder.Property(admissionClass => admissionClass.Id).ValueGeneratedNever();
        builder.Property(admissionClass => admissionClass.Name).HasColumnType("varchar(150)").IsRequired();
        builder.Property(admissionClass => admissionClass.CreatedAt).HasColumnType("timestamptz");

        // UX_AdmissionClasses_Name_Lower is an expression index on lower("Name").
        // EF cannot model this expression; its SQL is maintained in the migration.
    }
}
