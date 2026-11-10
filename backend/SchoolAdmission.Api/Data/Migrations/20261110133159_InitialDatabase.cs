using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SchoolAdmission.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialDatabase : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AdmissionClasses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "varchar(150)", nullable: false),
                    TotalSeats = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AdmissionClasses", x => x.Id);
                    table.CheckConstraint("CK_AdmissionClasses_TotalSeats", "\"TotalSeats\" > 0");
                });

            migrationBuilder.CreateTable(
                name: "AdmissionHolds",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClassId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<string>(type: "varchar(17)", nullable: false),
                    Status = table.Column<string>(type: "varchar(20)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamptz", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamptz", nullable: false),
                    ConfirmedAt = table.Column<DateTime>(type: "timestamptz", nullable: true),
                    CancelledAt = table.Column<DateTime>(type: "timestamptz", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AdmissionHolds", x => x.Id);
                    table.CheckConstraint("CK_AdmissionHolds_Status", "\"Status\" IN ('HELD', 'CONFIRMED', 'EXPIRED', 'CANCELLED')");
                    table.CheckConstraint("CK_AdmissionHolds_StudentId", "\"StudentId\" ~ '^[0-9]{17}$'");
                    table.ForeignKey(
                        name: "FK_AdmissionHolds_AdmissionClasses_ClassId",
                        column: x => x.ClassId,
                        principalTable: "AdmissionClasses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AdmissionHolds_ClassId",
                table: "AdmissionHolds",
                column: "ClassId");

            migrationBuilder.CreateIndex(
                name: "IX_AdmissionHolds_Status_ExpiresAt",
                table: "AdmissionHolds",
                columns: new[] { "Status", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AdmissionHolds_StudentId_CreatedAt",
                table: "AdmissionHolds",
                columns: new[] { "StudentId", "CreatedAt" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "UX_AdmissionHolds_StudentId_ClassId_Active",
                table: "AdmissionHolds",
                columns: new[] { "StudentId", "ClassId" },
                unique: true,
                filter: "\"Status\" IN ('HELD', 'CONFIRMED')");

            // Expression indexes are maintained explicitly because the EF model
            // cannot represent lower("Name"). Dropping the table removes the index.
            migrationBuilder.Sql("""
                CREATE UNIQUE INDEX "UX_AdmissionClasses_Name_Lower"
                ON "AdmissionClasses" (lower("Name"));
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AdmissionHolds");

            migrationBuilder.DropTable(
                name: "AdmissionClasses");
        }
    }
}
