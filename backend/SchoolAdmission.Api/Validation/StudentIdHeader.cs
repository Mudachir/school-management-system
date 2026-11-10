using Microsoft.Extensions.Primitives;

namespace SchoolAdmission.Api.Validation;

internal static class StudentIdHeader
{
    public const string Name = "X-Student-Id";
    public const string ValidationMessage = "X-Student-Id must contain exactly 17 ASCII digits.";

    public static bool TryRead(IHeaderDictionary headers, out string studentId)
    {
        StringValues values = headers[Name];
        if (values.Count == 1 && values[0] is { Length: 17 } value &&
            value.All(character => character is >= '0' and <= '9'))
        {
            studentId = value;
            return true;
        }

        studentId = string.Empty;
        return false;
    }
}
