using Scriban;
using Scriban.Runtime;

namespace LineGen;

internal static class TemplateRenderer
{
    public static string Render(string templateName, object model)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Templates", templateName);
        if (!File.Exists(path))
            throw new FileNotFoundException($"Template missing: {templateName}", path);
        var template = Template.Parse(File.ReadAllText(path), path);
        if (template.HasErrors)
            throw new InvalidOperationException(string.Join("; ", template.Messages));
        var script = new ScriptObject();
        script.Import(model, renamer: member => member.Name);
        var context = new TemplateContext();
        context.PushGlobal(script);
        return template.Render(context).TrimEnd() + Environment.NewLine;
    }
}
