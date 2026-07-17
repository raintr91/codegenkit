using System.Text.RegularExpressions;

namespace IntegrationGen;

internal static class NameUtil
{
    public static string ToPascal(string value)
    {
        var parts = Regex.Split(value, @"[-_\s]+").Where(part => part.Length > 0);
        return string.Concat(parts.Select(part => char.ToUpper(part[0]) + part[1..]));
    }

    public static string ToSnake(string value)
    {
        var snake = Regex.Replace(value, @"([a-z])([A-Z])", "$1_$2");
        return Regex.Replace(snake, @"[\s\-]+", "_").ToLowerInvariant();
    }
}
