<?php

declare(strict_types=1);

namespace Codegenkit\Laravel\UnitGen;

final class UnitRegistry
{
    public const REGISTRY_REL = 'registries/unit-test.registry.json';

    /**
     * @return array{registry: array<string, mixed>, registryPath: string}
     */
    public static function load(?string $preferredRoot = null): array
    {
        $candidates = [];
        if ($preferredRoot !== null && $preferredRoot !== '') {
            $candidates[] = rtrim($preferredRoot, '/\\');
        }
        $codegenkitRoot = getenv('CODEGENKIT_ROOT') ?: '';
        if ($codegenkitRoot !== '') {
            $candidates[] = rtrim($codegenkitRoot, '/\\');
        }
        $engineRoot = ProjectResolver::engineRoot();
        $candidates[] = dirname($engineRoot); // adapters/laravel when running from kit
        $candidates[] = $engineRoot;

        $registryPath = null;
        $raw = null;
        foreach (array_unique($candidates) as $root) {
            $path = $root.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, self::REGISTRY_REL);
            if (is_file($path)) {
                $registryPath = $path;
                $raw = (string) file_get_contents($path);
                break;
            }
        }

        if ($raw === null || $registryPath === null) {
            throw new \RuntimeException('unit-test.registry.json not found under '.implode(', ', $candidates));
        }

        $registry = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($registry) || empty($registry['version']) || empty($registry['patterns'])) {
            throw new \RuntimeException('Invalid unit test registry: '.self::REGISTRY_REL);
        }

        return ['registry' => $registry, 'registryPath' => self::REGISTRY_REL];
    }

    /** @param array<string, mixed> $registry @return array<string, mixed> */
    public static function getPattern(array $registry, string $patternId): array
    {
        $pattern = $registry['patterns'][$patternId] ?? null;
        if (!is_array($pattern)) {
            throw new \RuntimeException("Unknown unit test pattern [{$patternId}]");
        }

        return $pattern;
    }

    /** @param array<string, string> $ctx */
    public static function resolveOutputPath(string $outputPattern, array $ctx): string
    {
        return str_replace(
            ['{module}', '{entity}', '{EntityPascal}', '{requestClass}'],
            [
                (string) ($ctx['module'] ?? ''),
                (string) ($ctx['entity'] ?? ''),
                (string) ($ctx['entityPascal'] ?? ''),
                (string) ($ctx['requestClass'] ?? ''),
            ],
            $outputPattern
        );
    }

    /** @param array<string, string> $ctx */
    public static function expandTagTemplate(string $tag, array $ctx): string
    {
        return str_replace(
            ['{entity}', '{EntityPascal}', '{module}'],
            [
                (string) ($ctx['entity'] ?? ''),
                (string) ($ctx['entityPascal'] ?? ''),
                (string) ($ctx['module'] ?? ''),
            ],
            $tag
        );
    }

    /** @param array<string, string> $ctx */
    public static function expandCommand(string $command, array $ctx): string
    {
        return str_replace(
            ['{module}', '{entity}'],
            [(string) ($ctx['module'] ?? ''), (string) ($ctx['entity'] ?? '')],
            $command
        );
    }
}
