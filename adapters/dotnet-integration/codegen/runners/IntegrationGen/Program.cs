using System.Text.Json;
using IntegrationGen;
using Scriban;
using Scriban.Runtime;

static string ProjectRoot()
{
    var configured = Environment.GetEnvironmentVariable("CODEGENKIT_ROOT");
    var root = Path.GetFullPath(string.IsNullOrWhiteSpace(configured) ? Directory.GetCurrentDirectory() : configured);
    if (!Directory.Exists(root))
        throw new DirectoryNotFoundException($"CODEGENKIT_ROOT not found: {root}");
    return root;
}

static string UnderRoot(string root, string path, string label)
{
    var full = Path.GetFullPath(path, root);
    var relative = Path.GetRelativePath(root, full);
    if (relative == ".." || relative.StartsWith($"..{Path.DirectorySeparatorChar}") || Path.IsPathRooted(relative))
        throw new InvalidOperationException($"{label} must be inside CODEGENKIT_ROOT: {full}");
    return full;
}

static (Dictionary<string, object?> spec, string specPath, string featureDir) ReadSpec(string root, string specArg)
{
    var specPath = UnderRoot(root, specArg, "spec");
    var spec = YamlMap.Load(specPath);
    var parent = Path.GetFileName(Path.GetDirectoryName(specPath)!);
    var featureDir = parent is "ir" or "integration"
        ? Path.GetDirectoryName(Path.GetDirectoryName(specPath))!
        : Path.GetDirectoryName(specPath)!;
    return (spec, specPath, featureDir);
}

static string RenderTemplate(string name, object model)
{
    var templatePath = Path.Combine(AppContext.BaseDirectory, "Templates", name);
    var template = Template.Parse(File.ReadAllText(templatePath), templatePath);
    var script = new ScriptObject();
    script.Import(model, renamer: member => member.Name);
    var context = new TemplateContext();
    context.PushGlobal(script);
    return template.Render(context).TrimEnd() + Environment.NewLine;
}

static List<(string RelativePath, string Template)> BuildPlan(IntegrationContext context)
{
    var module = context.ModulePascal;
    var entity = context.EntityPascal;
    return
    [
        ($"src/Integration.Application/Generated/{module}/I{entity}Service.gen.cs", "application_service.cs.scriban"),
        ($"src/Integration.Infrastructure/Generated/{module}/Mock{entity}Repository.gen.cs", "infrastructure_mock.cs.scriban"),
        ($"src/Integration.Presenters/Generated/{module}/{entity}Presenter.gen.cs", "presenter.cs.scriban"),
        ($"tests/Integration.Api.Tests/Generated/{entity}ServiceTests.gen.cs", "service_test.cs.scriban"),
    ];
}

static int Registry(string root)
{
    Console.WriteLine(File.ReadAllText(Path.Combine(root, "registries", "dotnet-integration.codegen.registry.json")));
    return 0;
}

static int Run(string root, string command, string specArg, bool force)
{
    var dryRun = command == "dry";
    var (spec, specPath, featureDir) = ReadSpec(root, specArg);
    var context = IntegrationContext.FromSpec(spec);
    var model = context.ToTemplateModel();
    var written = new List<string>();
    Console.WriteLine($"integration-gen: entity={context.EntityPascal} module={context.ModulePascal}");
    Console.WriteLine($"  spec: {specPath}");

    foreach (var (relative, template) in BuildPlan(context))
    {
        var destination = UnderRoot(root, relative, "output");
        if (File.Exists(destination) && !force)
        {
            Console.WriteLine($"  skip: {relative} (exists)");
            continue;
        }
        var content = RenderTemplate(template, model);
        if (dryRun) Console.WriteLine($"  [dry]: {relative}");
        else
        {
            Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
            File.WriteAllText(destination, content);
            Console.WriteLine($"  write: {relative}");
        }
        written.Add(relative);
    }

    if (!dryRun)
    {
        var generatedDir = UnderRoot(root, Path.Combine(featureDir, "generated"), "generated metadata");
        Directory.CreateDirectory(generatedDir);
        var manifestPath = Path.Combine(generatedDir, "integration.manifest.json");
        File.WriteAllText(manifestPath, JsonSerializer.Serialize(new
        {
            generatedAt = DateTime.UtcNow.ToString("o"),
            spec = Path.GetRelativePath(root, specPath).Replace('\\', '/'),
            profile = context.Profile,
            files = written,
        }, new JsonSerializerOptions { WriteIndented = true }));
        var handoff = new ScriptObject();
        handoff.Import(model, renamer: member => member.Name);
        handoff["spec_path"] = specPath;
        handoff["files"] = written;
        var handoffContext = new TemplateContext();
        handoffContext.PushGlobal(handoff);
        var handoffTemplate = Template.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Templates", "handoff.md.scriban")));
        File.WriteAllText(Path.Combine(generatedDir, "INTEGRATION-HANDOFF.md"), handoffTemplate.Render(handoffContext));
        Console.WriteLine($"  manifest: {manifestPath}");
    }
    return 0;
}

if (args.Length == 0)
{
    Console.Error.WriteLine("Usage: IntegrationGen registry | dry --spec <path> | write --spec <path> [--force]");
    return 1;
}

try
{
    var root = ProjectRoot();
    var force = args.Contains("--force");
    var specIndex = Array.IndexOf(args, "--spec");
    var specPath = specIndex >= 0 && specIndex + 1 < args.Length ? args[specIndex + 1] : null;
    return args[0] switch
    {
        "registry" => Registry(root),
        "dry" or "write" when specPath is not null => Run(root, args[0], specPath, force),
        _ => 1,
    };
}
catch (Exception error)
{
    Console.Error.WriteLine($"IntegrationGen: {error.Message}");
    return 1;
}
