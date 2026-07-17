namespace LineGen;

internal sealed class LineContext
{
    public required string ScreenId { get; init; }
    public required string ScreenPascal { get; init; }
    public required string EntityPascal { get; init; }
    public required string Profile { get; init; }
    public required string ApiPath { get; init; }
    public required string ApiMethod { get; init; }

    public static LineContext FromSpec(Dictionary<string, object?> spec)
    {
        var line = YamlMap.GetDict(YamlMap.GetDict(spec, "clients"), "line");
        var screens = YamlMap.AsList(line.GetValueOrDefault("screens")) ?? [];
        var screen = screens.Count > 0 && YamlMap.AsDict(screens[0]) is { } value
            ? value
            : new Dictionary<string, object?> { ["id"] = "screen" };
        var screenId = YamlMap.GetString(screen, "id", "screen");
        var endpoints = YamlMap.GetDict(YamlMap.GetDict(line, "api"), "endpoints");
        var checkIn = YamlMap.GetDict(endpoints, "checkIn");
        var codegen = YamlMap.GetDict(spec, "codegen");
        return new LineContext
        {
            ScreenId = screenId,
            ScreenPascal = NameUtil.ToPascal(screenId),
            EntityPascal = NameUtil.ToPascal(YamlMap.GetString(codegen, "entity", screenId)),
            Profile = YamlMap.GetString(codegen, "profile", YamlMap.GetString(line, "profile", "kiosk")),
            ApiPath = YamlMap.GetString(checkIn, "path", "/workforce/check-in").TrimStart('/'),
            ApiMethod = YamlMap.GetString(checkIn, "method", "POST"),
        };
    }

    public object ToTemplateModel() => new
    {
        screen_id = ScreenId,
        screen_pascal = ScreenPascal,
        entity_pascal = EntityPascal,
        profile = Profile,
        api_path = ApiPath,
        api_method = ApiMethod,
    };
}
