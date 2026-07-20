<?php

declare(strict_types=1);

namespace Codegenkit\Laravel\UnitGen;

final class SpecExtract
{
    public static function resolveOpenApiPath(string $specFile): ?string
    {
        $candidate = dirname($specFile).DIRECTORY_SEPARATOR.'02-openapi.yaml';

        return is_file($candidate) ? $candidate : null;
    }

    /**
     * @param  array<string, mixed>  $spec
     * @return array{module: string, entity: array<string, mixed>}|null
     */
    public static function findEntityInSpec(array $spec, string $entity): ?array
    {
        foreach ($spec['modules'] ?? [] as $mod) {
            foreach ($mod['entities'] ?? [] as $ent) {
                if (($ent['name'] ?? null) === $entity) {
                    return ['module' => (string) ($mod['name'] ?? ''), 'entity' => $ent];
                }
            }
        }

        return null;
    }

    /** @param array<string, mixed> $spec @return list<string> */
    public static function extractSearchRequestRuleKeys(array $spec, string $entity): array
    {
        $fromRequests = [];
        foreach ($spec['requests'] ?? [] as $name => $def) {
            $nameStr = (string) $name;
            if (
                !str_contains($nameStr, 'SearchRequest')
                && !str_contains(strtolower($nameStr), strtolower($entity))
            ) {
                continue;
            }
            foreach ($def['fields'] ?? [] as $field) {
                if (!empty($field['name'])) {
                    $fromRequests[] = (string) $field['name'];
                }
            }
        }

        if ($fromRequests !== []) {
            return array_values(array_unique($fromRequests));
        }

        return ['page', 'per_page', 'order_by', 'sorted_by'];
    }

    /** @param array<string, mixed> $spec */
    public static function extractPerPageDefault(array $spec): int
    {
        foreach ($spec['api']['endpoints'] ?? [] as $endpoint) {
            if (($endpoint['action'] ?? null) === 'search' && isset($endpoint['query']['perPageDefault'])) {
                return (int) $endpoint['query']['perPageDefault'];
            }
        }

        return 100;
    }

    /** @param array<string, mixed> $spec */
    public static function extractSessionScopeColumn(array $spec, string $entity): ?string
    {
        $found = self::findEntityInSpec($spec, $entity);
        $col = $found['entity']['scope']['bySession'] ?? null;

        return $col !== null ? (string) $col : null;
    }

    /** @param array<string, mixed> $spec @return list<string> */
    public static function extractRelationshipNames(array $spec, string $entity): array
    {
        $relationships = self::findEntityInSpec($spec, $entity)['entity']['relationships'] ?? [];
        $names = [];
        foreach ($relationships as $rel) {
            if (!empty($rel['name'])) {
                $names[] = (string) $rel['name'];
            }
        }

        return $names;
    }

    /** @param array<string, mixed> $spec @return list<string> */
    public static function extractHasManyRelationships(array $spec, string $entity): array
    {
        $relationships = self::findEntityInSpec($spec, $entity)['entity']['relationships'] ?? [];
        $names = [];
        foreach ($relationships as $rel) {
            if (($rel['type'] ?? null) === 'hasMany' && !empty($rel['name'])) {
                $names[] = (string) $rel['name'];
            }
        }

        return $names;
    }

    /** @param array<string, mixed> $spec @return list<string> */
    public static function extractResourceFieldKeys(array $spec, string $module, string $entity): array
    {
        $resourceName = $module.$entity.'Resource';
        $def = $spec['responses'][$resourceName] ?? null;
        if (!empty($def['fields']) && is_array($def['fields'])) {
            $keys = [];
            foreach ($def['fields'] as $field) {
                if (!empty($field['name'])) {
                    $keys[] = (string) $field['name'];
                }
            }

            return $keys;
        }

        return ['id', 'name'];
    }

    /** @return list<string> */
    public static function extractOpenApiSchemaKeys(?string $openapiPath, string $schemaName): array
    {
        if ($openapiPath === null || !is_file($openapiPath)) {
            return [];
        }

        try {
            $doc = SpecReader::parseYaml((string) file_get_contents($openapiPath));
            $schema = $doc['components']['schemas'][$schemaName] ?? null;
            if (!is_array($schema) || empty($schema['properties']) || !is_array($schema['properties'])) {
                return [];
            }

            return array_map('strval', array_keys($schema['properties']));
        } catch (\Throwable) {
            return [];
        }
    }

    public static function resolveOpenApiEntitySchemaName(string $module, string $entity): string
    {
        return $module.$entity;
    }

    /** @param array<string, mixed> $spec */
    public static function inferModelFqcn(array $spec, string $entity, string $module): string
    {
        $found = self::findEntityInSpec($spec, $entity);
        $mode = $found['entity']['mode'] ?? 'Tenant';
        unset($module);

        return 'App\\Models\\'.$mode.'\\'.$entity;
    }

    /**
     * @param  array<string, mixed>  $spec
     * @return array<string, mixed>
     */
    public static function buildBehavioralContext(array $spec, string $specFile, string $module, string $entity): array
    {
        $openapiPath = self::resolveOpenApiPath($specFile);
        $openApiSchema = self::resolveOpenApiEntitySchemaName($module, $entity);
        $openApiKeys = self::extractOpenApiSchemaKeys($openapiPath, $openApiSchema);
        $resourceKeys = self::extractResourceFieldKeys($spec, $module, $entity);
        $displayKeys = $openApiKeys !== [] ? $openApiKeys : $resourceKeys;
        $hasManyRelations = self::extractHasManyRelationships($spec, $entity);

        return [
            'searchRequestClass' => $entity.'SearchRequest',
            'searchRequestFqcn' => "Modules\\{$module}\\Http\\Requests\\{$entity}SearchRequest",
            'ruleKeys' => self::extractSearchRequestRuleKeys($spec, $entity),
            'perPageDefault' => self::extractPerPageDefault($spec),
            'sessionScopeColumn' => self::extractSessionScopeColumn($spec, $entity),
            'relationshipNames' => self::extractRelationshipNames($spec, $entity),
            'hasManyRelations' => $hasManyRelations,
            'resourceKeys' => $displayKeys,
            'openApiKeys' => $displayKeys,
            'nestedRelationKey' => $hasManyRelations[0] ?? 'managers',
            'modelFqcn' => self::inferModelFqcn($spec, $entity, $module),
            'entityQueryFqcn' => "Modules\\{$module}\\Http\\Queries\\{$entity}Query",
            'entityActionFqcn' => "Modules\\{$module}\\Http\\Actions\\{$entity}Action",
            'entityResourceFqcn' => "Modules\\{$module}\\Http\\Resources\\{$entity}Resource",
            'openApiSchema' => $openApiSchema,
        ];
    }
}
