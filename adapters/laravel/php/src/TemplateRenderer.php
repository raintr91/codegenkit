<?php

declare(strict_types=1);

namespace Codegenkit\Laravel\UnitGen;

final class TemplateRenderer
{
    public static function templatesDir(): string
    {
        return ProjectResolver::engineRoot().DIRECTORY_SEPARATOR.'templates';
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public static function render(string $templateRel, array $context): string
    {
        $path = self::resolveTemplatePath($templateRel);
        $source = (string) file_get_contents($path);
        $rendered = self::renderSource($source, $context);

        return rtrim($rendered)."\n";
    }

    public static function resolveTemplatePath(string $templateRel): string
    {
        $dir = self::templatesDir();
        $candidates = [$templateRel];
        if (str_ends_with($templateRel, '.hbs')) {
            $candidates[] = preg_replace('/\.hbs$/', '.stub', $templateRel) ?? $templateRel;
            $candidates[] = preg_replace('/\.php\.hbs$/', '.php.stub', $templateRel) ?? $templateRel;
        }

        foreach ($candidates as $rel) {
            $path = $dir.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $rel);
            if (is_file($path)) {
                return $path;
            }
        }

        throw new \RuntimeException("Template not found: {$templateRel} under {$dir}");
    }

    /**
     * Minimal Handlebars-compatible renderer for current Laravel unitgen stubs.
     * Supports: {{var}}, {{phpFqcn var}}, {{phpStringArray var}}, {{json var}}, {{eq a b}} (unused in stubs).
     *
     * @param  array<string, mixed>  $context
     */
    public static function renderSource(string $source, array $context): string
    {
        return (string) preg_replace_callback(
            '/\{\{\s*(?:(phpFqcn|phpStringArray|json|eq)\s+)?([^}]+?)\s*\}\}/',
            static function (array $m) use ($context): string {
                $helper = $m[1] ?? '';
                $expr = trim($m[2]);
                if ($helper === 'phpFqcn') {
                    return self::phpFqcn(self::lookup($context, $expr));
                }
                if ($helper === 'phpStringArray') {
                    return self::phpStringArray(self::lookup($context, $expr));
                }
                if ($helper === 'json') {
                    return json_encode(self::lookup($context, $expr), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) ?: 'null';
                }
                if ($helper === 'eq') {
                    $parts = preg_split('/\s+/', $expr) ?: [];

                    return (self::lookup($context, $parts[0] ?? '') == self::lookup($context, $parts[1] ?? '')) ? '1' : '';
                }

                $value = self::lookup($context, $expr);
                if (is_bool($value)) {
                    return $value ? '1' : '';
                }
                if (is_array($value) || is_object($value)) {
                    return json_encode($value, JSON_UNESCAPED_SLASHES) ?: '';
                }

                return (string) $value;
            },
            $source
        );
    }

    /** @param array<string, mixed> $context */
    private static function lookup(array $context, string $key): mixed
    {
        $key = trim($key);
        if ($key === '') {
            return null;
        }
        if (array_key_exists($key, $context)) {
            return $context[$key];
        }
        // dotted path
        $parts = explode('.', $key);
        $cur = $context;
        foreach ($parts as $part) {
            if (!is_array($cur) || !array_key_exists($part, $cur)) {
                return null;
            }
            $cur = $cur[$part];
        }

        return $cur;
    }

    private static function phpFqcn(mixed $fqcn): string
    {
        $name = (string) ($fqcn ?? '');
        if ($name === '') {
            return '';
        }

        return str_starts_with($name, '\\') ? $name : '\\'.$name;
    }

    private static function phpStringArray(mixed $items): string
    {
        $arr = is_array($items) ? $items : [];
        $encoded = array_map(
            static function ($item): string {
                $s = str_replace(['\\', "'"], ['\\\\', "\\'"], (string) $item);

                return "'{$s}'";
            },
            $arr
        );

        return '['.implode(', ', $encoded).']';
    }
}
