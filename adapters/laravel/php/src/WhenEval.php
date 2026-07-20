<?php

declare(strict_types=1);

namespace Codegenkit\Laravel\UnitGen;

final class WhenEval
{
    /**
     * @param  array<string, mixed>  $ctx
     * @param  mixed  $when
     */
    public static function matchesPatternWhen(array $ctx, mixed $when): bool
    {
        if ($when === null || $when === '') {
            return true;
        }
        if (is_string($when)) {
            return self::matchesLegacyWhen($ctx, $when);
        }
        if (!is_array($when)) {
            return false;
        }
        if (isset($when['any']) && is_array($when['any'])) {
            foreach ($when['any'] as $condition) {
                if (self::matchesCondition($ctx, $condition)) {
                    return true;
                }
            }

            return false;
        }
        if (isset($when['all']) && is_array($when['all'])) {
            foreach ($when['all'] as $condition) {
                if (!self::matchesCondition($ctx, $condition)) {
                    return false;
                }
            }

            return true;
        }

        return self::matchesCondition($ctx, $when);
    }

    /** @param array<string, mixed> $ctx @param array<string, mixed> $condition */
    private static function matchesCondition(array $ctx, array $condition): bool
    {
        if (isset($condition['manualAction'])) {
            return in_array((string) $condition['manualAction'], $ctx['manual']['actions'] ?? [], true);
        }
        if (isset($condition['manualTest'])) {
            return in_array((string) $condition['manualTest'], $ctx['manual']['tests'] ?? [], true);
        }
        if (isset($condition['manualService'])) {
            return in_array((string) $condition['manualService'], $ctx['manual']['services'] ?? [], true);
        }
        if (($condition['entityScope'] ?? null) === 'bySession') {
            return WorkspaceInspector::entityHasChainScope($ctx['spec'], (string) $ctx['entity']);
        }
        if (($condition['hasRelationships'] ?? null) === true) {
            return WorkspaceInspector::entityHasRelationships($ctx['spec'], (string) $ctx['entity']);
        }
        if (($condition['hasModuleRequests'] ?? null) === true) {
            return count($ctx['requestClasses'] ?? []) > 0;
        }
        if (isset($condition['wire'])) {
            $wire = $ctx['codegenManifest']['wire'] ?? $ctx['spec']['codegen']['wire'] ?? [];

            return ($wire[(string) $condition['wire']] ?? null) === true;
        }

        return false;
    }

    /** @param array<string, mixed> $ctx */
    private static function matchesLegacyWhen(array $ctx, string $when): bool
    {
        if (str_contains($when, 'manual-action:chain-scope') && in_array('chain-scope', $ctx['manual']['actions'] ?? [], true)) {
            return true;
        }
        if (str_contains($when, 'entity.scope.bySession') && WorkspaceInspector::entityHasChainScope($ctx['spec'], (string) $ctx['entity'])) {
            return true;
        }
        if (str_contains($when, 'relationships') && WorkspaceInspector::entityHasRelationships($ctx['spec'], (string) $ctx['entity'])) {
            return true;
        }
        if (str_contains($when, 'manual-action:relationships') && in_array('relationships', $ctx['manual']['actions'] ?? [], true)) {
            return true;
        }
        if (str_contains($when, 'module has Http/Requests')) {
            return count($ctx['requestClasses'] ?? []) > 0;
        }

        return false;
    }

    /** @param array<string, mixed> $registry */
    public static function resolvePatternIdForManualTopic(array $registry, string $topic): ?string
    {
        $entry = $registry['manualTopicMap'][$topic] ?? null;
        if ($entry === null) {
            return null;
        }
        if (is_string($entry)) {
            return $entry;
        }

        return $entry['patternId'] ?? null;
    }
}
