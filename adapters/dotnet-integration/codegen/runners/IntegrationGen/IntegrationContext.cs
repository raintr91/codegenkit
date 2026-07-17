namespace IntegrationGen;

internal sealed class IntegrationContext
{
    public required string Module { get; init; }
    public required string ModulePascal { get; init; }
    public required string EntityPascal { get; init; }
    public required string EntitySnake { get; init; }
    public required string Profile { get; init; }
    public required string ApiPath { get; init; }
    public required string ApiMethod { get; init; }
    public required string Action { get; init; }
    public required string ActionPascal { get; init; }
    public required string FeatureId { get; init; }

    public static IntegrationContext FromSpec(Dictionary<string, object?> spec)
    {
        var feature = YamlMap.GetDict(spec, "feature");
        var codegen = YamlMap.GetDict(spec, "codegen");
        var module = YamlMap.GetString(codegen, "module", "mes");
        var entity = YamlMap.GetString(codegen, "entity", "Entity");
        var profile = YamlMap.GetString(codegen, "profile", "adapter");
        var endpoints = YamlMap.AsList(YamlMap.GetDict(spec, "api").GetValueOrDefault("endpoints")) ?? [];
        var endpoint = endpoints.Count > 0 && YamlMap.AsDict(endpoints[0]) is { } value
            ? value
            : new Dictionary<string, object?>();
        var action = YamlMap.GetString(endpoint, "action", "get");
        return new IntegrationContext
        {
            Module = module,
            ModulePascal = NameUtil.ToPascal(module),
            EntityPascal = NameUtil.ToPascal(entity),
            EntitySnake = NameUtil.ToSnake(entity),
            Profile = profile,
            ApiPath = YamlMap.GetString(endpoint, "path", "/plants/{plant_id}/downtime"),
            ApiMethod = YamlMap.GetString(endpoint, "method", "GET"),
            Action = action,
            ActionPascal = action == "getDowntime" ? "GetDowntime" : NameUtil.ToPascal(action),
            FeatureId = YamlMap.GetString(feature, "id", NameUtil.ToSnake(entity)),
        };
    }

    public object ToTemplateModel() => new
    {
        module = Module,
        module_pascal = ModulePascal,
        entity_pascal = EntityPascal,
        entity_snake = EntitySnake,
        profile = Profile,
        api_path = ApiPath,
        api_method = ApiMethod,
        action = Action,
        action_pascal = ActionPascal,
        feature_id = FeatureId,
    };
}
