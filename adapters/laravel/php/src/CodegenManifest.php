<?php

declare(strict_types=1);

namespace Codegenkit\Laravel\UnitGen;

final class CodegenManifest
{
    /**
     * @return array{manifest: array<string, mixed>, manifestPath: string}
     */
    public static function read(string $featureDir): array
    {
        $manifestPath = $featureDir.DIRECTORY_SEPARATOR.'generated'.DIRECTORY_SEPARATOR.'codegen.manifest.json';
        if (!is_file($manifestPath)) {
            throw new \RuntimeException(
                "Missing {$manifestPath} — run codegenkit api-gen --spec ... first"
            );
        }

        $manifest = json_decode((string) file_get_contents($manifestPath), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($manifest) || empty($manifest['module']) || empty($manifest['entity'])) {
            throw new \RuntimeException("Invalid codegen manifest at {$manifestPath}");
        }

        return ['manifest' => $manifest, 'manifestPath' => $manifestPath];
    }
}
