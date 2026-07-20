<?php

declare(strict_types=1);

namespace Codegenkit\Laravel\UnitGen;

final class SpecReader
{
    /**
     * @return array{spec: array<string, mixed>, specFile: string, featureDir: string, raw: string}
     */
    public static function read(string $specPath): array
    {
        $absolute = realpath($specPath) ?: (string) (new \SplFileInfo($specPath))->getRealPath();
        if ($absolute === '' || !is_file($specPath)) {
            $absolute = (string) realpath(dirname($specPath));
            if ($absolute === '') {
                throw new \RuntimeException("Spec file not found: {$specPath}");
            }
            $absolute = $absolute.DIRECTORY_SEPARATOR.basename($specPath);
        }
        if (!is_file($absolute) && is_file($specPath)) {
            $absolute = $specPath;
        }
        if (!is_file($absolute)) {
            throw new \RuntimeException("Spec file not found: {$specPath}");
        }

        $raw = (string) file_get_contents($absolute);
        $spec = self::parseYaml($raw);
        $parent = dirname($absolute);
        $featureDir = basename($parent) === 'backend' ? dirname($parent) : $parent;

        return [
            'spec' => $spec,
            'specFile' => $absolute,
            'featureDir' => $featureDir,
            'raw' => $raw,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function parseYaml(string $raw): array
    {
        if (!class_exists(\Symfony\Component\Yaml\Yaml::class)) {
            throw new \RuntimeException(
                'symfony/yaml is required. Add "symfony/yaml" to the product composer.json require-dev.'
            );
        }

        $parsed = \Symfony\Component\Yaml\Yaml::parse($raw);

        return is_array($parsed) ? $parsed : [];
    }
}
