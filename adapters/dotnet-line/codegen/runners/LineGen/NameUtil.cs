using System.Text.RegularExpressions;

namespace LineGen;

internal static class NameUtil
{
    public static string ToPascal(string value)
    {
        var parts = Regex.Split(value, @"[-_\s]+").Where(part => part.Length > 0);
        return string.Concat(parts.Select(part => char.ToUpper(part[0]) + part[1..]));
    }
}
