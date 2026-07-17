namespace LineGen;

internal static class YamlMap
{
    private static readonly YamlDotNet.Serialization.IDeserializer Deserializer =
        new YamlDotNet.Serialization.DeserializerBuilder().Build();

    public static Dictionary<string, object?> Load(string path)
    {
        var data = Deserializer.Deserialize<Dictionary<string, object?>>(File.ReadAllText(path))
            ?? throw new InvalidOperationException($"Invalid YAML: {path}");
        return NormalizeDict(data);
    }

    private static Dictionary<string, object?> NormalizeDict(Dictionary<string, object?> source)
        => source.ToDictionary(pair => pair.Key, pair => NormalizeValue(pair.Value));

    private static object? NormalizeValue(object? value) => value switch
    {
        Dictionary<string, object?> dictionary => NormalizeDict(dictionary),
        Dictionary<object, object?> dictionary => NormalizeDict(dictionary.ToDictionary(pair => pair.Key.ToString()!, pair => pair.Value)),
        IDictionary<object, object> dictionary => NormalizeDict(dictionary.ToDictionary(pair => pair.Key.ToString()!, pair => pair.Value)),
        IList<object?> list => list.Select(NormalizeValue).ToList(),
        IEnumerable<object> list => list.Select(NormalizeValue).ToList(),
        _ => value,
    };

    public static Dictionary<string, object?>? AsDict(object? value) => value switch
    {
        Dictionary<string, object?> dictionary => dictionary,
        Dictionary<object, object?> dictionary => NormalizeDict(dictionary.ToDictionary(pair => pair.Key.ToString()!, pair => pair.Value)),
        IDictionary<object, object> dictionary => NormalizeDict(dictionary.ToDictionary(pair => pair.Key.ToString()!, pair => pair.Value)),
        _ => null,
    };

    public static List<object?>? AsList(object? value) => value switch
    {
        List<object?> list => list,
        IList<object?> list => list.ToList(),
        IEnumerable<object> list => list.Cast<object?>().ToList(),
        _ => null,
    };

    public static string GetString(Dictionary<string, object?> dictionary, string key, string fallback = "")
        => dictionary.TryGetValue(key, out var value) && value is string text ? text : fallback;

    public static Dictionary<string, object?> GetDict(Dictionary<string, object?> dictionary, string key)
        => AsDict(dictionary.GetValueOrDefault(key)) ?? new Dictionary<string, object?>();
}
