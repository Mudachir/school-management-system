using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace SchoolAdmission.Api.Contracts.Classes;

public sealed class CreateClassRequest
{
    private string? name;

    [Required(ErrorMessage = "Name is required and must not be blank.")]
    [StringLength(150, ErrorMessage = "Name must not exceed 150 characters.")]
    public string? Name
    {
        get => name;
        init => name = value?.Trim();
    }

    [Range(1, int.MaxValue, ErrorMessage = "TotalSeats must be a positive integer.")]
    [JsonNumberHandling(JsonNumberHandling.Strict)]
    public int TotalSeats { get; init; }
}
