namespace SchoolAdmission.Api.Domain;

public sealed class AdmissionClass
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public required string Name { get; set; }
    public int TotalSeats { get; set; }
    public DateTime CreatedAt { get; set; }
}
