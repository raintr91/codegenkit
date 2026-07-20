<?php

declare(strict_types=1);

namespace Codegenkit\Laravel\UnitGen;

final class ProjectResolver
{
    /**
     * @return array{targetRoot: string, laravelRoot: string, framework: string, profile: string}
     */
    public static function resolve(): array
    {
        $configured = getenv('CODEGENKIT_ROOT');
        if ($configured === false || $configured === '') {
            throw new \RuntimeException('CODEGENKIT_ROOT is required for Laravel generation');
        }

        $target = realpath($configured) ?: $configured;
        $candidates = [$target, $target.DIRECTORY_SEPARATOR.'src'];
        $laravelRoot = null;
        foreach ($candidates as $candidate) {
            if (
                is_file($candidate.DIRECTORY_SEPARATOR.'artisan')
                && is_file($candidate.DIRECTORY_SEPARATOR.'composer.json')
            ) {
                $laravelRoot = $candidate;
                break;
            }
        }

        if ($laravelRoot === null) {
            throw new \RuntimeException(
                "Laravel project not found under {$target}; expected artisan + composer.json at root or src/"
            );
        }

        $composer = json_decode(
            (string) file_get_contents($laravelRoot.DIRECTORY_SEPARATOR.'composer.json'),
            true,
            512,
            JSON_THROW_ON_ERROR
        );
        $packages = array_merge($composer['require'] ?? [], $composer['require-dev'] ?? []);
        $framework = $packages['laravel/framework'] ?? null;
        if ($framework === null) {
            throw new \RuntimeException('Target composer.json does not require laravel/framework');
        }
        if (!preg_match('/(^|[^\d])12(?:\.|[^\d]|$)/', (string) $framework)) {
            throw new \RuntimeException(
                "Laravel adapter profile modules-v1 requires Laravel 12 (found {$framework})"
            );
        }
        if (!isset($packages['nwidart/laravel-modules'])) {
            throw new \RuntimeException(
                'Laravel adapter profile modules-v1 requires nwidart/laravel-modules'
            );
        }

        return [
            'targetRoot' => $target,
            'laravelRoot' => $laravelRoot,
            'framework' => (string) $framework,
            'profile' => 'modules-v1',
        ];
    }

    public static function assertContained(string $root, string $candidate, string $label = 'path'): string
    {
        $base = realpath($root) ?: $root;
        $resolved = realpath(dirname($candidate));
        $resolved = $resolved !== false
            ? $resolved.DIRECTORY_SEPARATOR.basename($candidate)
            : $candidate;
        $baseNorm = rtrim(str_replace('\\', '/', $base), '/');
        $candNorm = str_replace('\\', '/', $resolved);
        if ($candNorm !== $baseNorm && !str_starts_with($candNorm, $baseNorm.'/')) {
            throw new \RuntimeException("{$label} escapes target root: {$candidate}");
        }

        return $resolved;
    }

    public static function engineRoot(): string
    {
        return dirname(__DIR__);
    }

    public static function adapterRoot(): string
    {
        // adapters/laravel/php → adapters/laravel; or src/.codegenkit → parent product
        $engine = self::engineRoot();
        $parent = dirname($engine);
        if (is_dir($parent.DIRECTORY_SEPARATOR.'registries')) {
            return $parent;
        }

        return $engine;
    }
}
