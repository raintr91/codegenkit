<?php

declare(strict_types=1);

namespace Codegenkit\Laravel\UnitGen;

final class WorkspaceInspector
{
    /**
     * @param  array{module: string, entity: string, pathModel?: string}  $ctx
     * @return array<string, string>
     */
    public static function resolveUnitPaths(array $ctx, string $repoRoot): array
    {
        $moduleRoot = $repoRoot.DIRECTORY_SEPARATOR.'Modules'.DIRECTORY_SEPARATOR.$ctx['module'];

        return [
            'moduleRoot' => $moduleRoot,
            'supportDir' => $moduleRoot.DIRECTORY_SEPARATOR.'Tests'.DIRECTORY_SEPARATOR.'Support',
            'requestsDir' => $moduleRoot.DIRECTORY_SEPARATOR.'Http'.DIRECTORY_SEPARATOR.'Requests',
            'controllerInvokeTest' => $moduleRoot.DIRECTORY_SEPARATOR.'Tests'.DIRECTORY_SEPARATOR.'Feature'.DIRECTORY_SEPARATOR.'Http'.DIRECTORY_SEPARATOR.'Controllers'.DIRECTORY_SEPARATOR.$ctx['entity'].'ControllerInvokeTest.php',
            'controllerTest' => $moduleRoot.DIRECTORY_SEPARATOR.'Tests'.DIRECTORY_SEPARATOR.'Feature'.DIRECTORY_SEPARATOR.'Http'.DIRECTORY_SEPARATOR.'Controllers'.DIRECTORY_SEPARATOR.$ctx['entity'].'ControllerTest.php',
            'actionTest' => $moduleRoot.DIRECTORY_SEPARATOR.'Tests'.DIRECTORY_SEPARATOR.'Unit'.DIRECTORY_SEPARATOR.'Http'.DIRECTORY_SEPARATOR.'Actions'.DIRECTORY_SEPARATOR.$ctx['entity'].'ActionTest.php',
            'queryTest' => $moduleRoot.DIRECTORY_SEPARATOR.'Tests'.DIRECTORY_SEPARATOR.'Unit'.DIRECTORY_SEPARATOR.'Http'.DIRECTORY_SEPARATOR.'Queries'.DIRECTORY_SEPARATOR.$ctx['entity'].'QueryTest.php',
            'resourceTest' => $moduleRoot.DIRECTORY_SEPARATOR.'Tests'.DIRECTORY_SEPARATOR.'Unit'.DIRECTORY_SEPARATOR.'Http'.DIRECTORY_SEPARATOR.'Resources'.DIRECTORY_SEPARATOR.$ctx['entity'].'ResourceTest.php',
            'exercisesHooks' => $moduleRoot.DIRECTORY_SEPARATOR.'Tests'.DIRECTORY_SEPARATOR.'Support'.DIRECTORY_SEPARATOR.'ExercisesRequestValidationHooks.php',
            'controllerInvoker' => $moduleRoot.DIRECTORY_SEPARATOR.'Tests'.DIRECTORY_SEPARATOR.'Support'.DIRECTORY_SEPARATOR.'ControllerMethodInvoker.php',
        ];
    }

    /** @return list<string> */
    public static function listModuleRequestClasses(string $requestsDir, string $module): array
    {
        if (!is_dir($requestsDir)) {
            return [];
        }

        $baseNames = [$module.'Request' => true, $module.'SearchRequest' => true];
        $classes = [];
        foreach (scandir($requestsDir) ?: [] as $name) {
            if (!str_ends_with($name, '.php')) {
                continue;
            }
            $className = substr($name, 0, -4);
            if (isset($baseNames[$className])) {
                continue;
            }
            $classes[] = $className;
        }
        sort($classes);

        return $classes;
    }

    /** @return array{fqcn: string, className: string} */
    public static function inferModuleBaseRequest(string $moduleRoot, string $module): array
    {
        $searchPath = $moduleRoot.DIRECTORY_SEPARATOR.'Http'.DIRECTORY_SEPARATOR.'Requests'.DIRECTORY_SEPARATOR.$module.'SearchRequest.php';
        $requestPath = $moduleRoot.DIRECTORY_SEPARATOR.'Http'.DIRECTORY_SEPARATOR.'Requests'.DIRECTORY_SEPARATOR.$module.'Request.php';

        if (is_file($searchPath)) {
            return [
                'fqcn' => "Modules\\{$module}\\Http\\Requests\\{$module}SearchRequest",
                'className' => $module.'SearchRequest',
            ];
        }
        if (is_file($requestPath)) {
            return [
                'fqcn' => "Modules\\{$module}\\Http\\Requests\\{$module}Request",
                'className' => $module.'Request',
            ];
        }

        return [
            'fqcn' => 'App\\Http\\Requests\\SearchRequest',
            'className' => 'SearchRequest',
        ];
    }

    /** @param array<string, mixed> $spec @return list<string> */
    public static function collectRequirementIds(array $spec): array
    {
        $ids = [];
        foreach ($spec['requirements']['covered'] ?? [] as $id) {
            $ids[] = (string) $id;
        }

        return array_values(array_filter($ids));
    }

    /** @param array<string, mixed> $spec */
    public static function entityHasRelationships(array $spec, string $entity): bool
    {
        foreach ($spec['modules'] ?? [] as $mod) {
            foreach ($mod['entities'] ?? [] as $ent) {
                if (($ent['name'] ?? null) === $entity && !empty($ent['relationships'])) {
                    return true;
                }
            }
        }

        return false;
    }

    /** @param array<string, mixed> $spec */
    public static function entityHasChainScope(array $spec, string $entity): bool
    {
        foreach ($spec['modules'] ?? [] as $mod) {
            foreach ($mod['entities'] ?? [] as $ent) {
                if (($ent['name'] ?? null) === $entity && !empty($ent['scope']['bySession'])) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>|null  $manifest
     * @return array{satisfied: bool, reason: ?string}
     */
    public static function structuralTestsSatisfiedByCodegen(?array $manifest): array
    {
        if ($manifest === null) {
            return ['satisfied' => false, 'reason' => null];
        }

        foreach ($manifest['execution'] ?? [] as $entry) {
            if (($entry['id'] ?? null) === 'module-test' && in_array((string) ($entry['status'] ?? ''), ['OK', 'SKIPPED'], true)) {
                return [
                    'satisfied' => true,
                    'reason' => 'codegen.manifest execution: module-test '.$entry['status'],
                ];
            }
        }

        foreach ($manifest['skipped'] ?? [] as $entry) {
            if (($entry['id'] ?? null) === 'module-test') {
                return [
                    'satisfied' => true,
                    'reason' => 'codegen.manifest skipped: module-test ('.($entry['reason'] ?? 'already exists').')',
                ];
            }
        }

        foreach ($manifest['tagPlan'] ?? [] as $entry) {
            if (($entry['tag'] ?? null) === '#gen:test-module' && ($entry['status'] ?? null) === 'skipped') {
                return [
                    'satisfied' => true,
                    'reason' => 'codegen.manifest tagPlan: #gen:test-module skipped',
                ];
            }
        }

        return ['satisfied' => false, 'reason' => null];
    }

    /**
     * @param  array{module: string, entity: string}  $ctx
     * @return array{satisfied: bool, reason: ?string}
     */
    public static function structuralTestsSatisfiedByWorkspace(array $ctx, string $repoRoot): array
    {
        $paths = self::resolveUnitPaths($ctx, $repoRoot);
        $layers = [
            ['prod' => 'Http/Controllers/'.$ctx['entity'].'Controller.php', 'test' => $paths['controllerTest']],
            ['prod' => 'Http/Actions/'.$ctx['entity'].'Action.php', 'test' => $paths['actionTest']],
            ['prod' => 'Http/Queries/'.$ctx['entity'].'Query.php', 'test' => $paths['queryTest']],
            ['prod' => 'Http/Resources/'.$ctx['entity'].'Resource.php', 'test' => $paths['resourceTest']],
        ];

        $required = 0;
        $present = 0;
        foreach ($layers as $layer) {
            $prodPath = $paths['moduleRoot'].DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $layer['prod']);
            if (!is_file($prodPath)) {
                continue;
            }
            $required++;
            if (is_file($layer['test'])) {
                $present++;
            }
        }

        if (is_dir($paths['requestsDir'])) {
            $entityPrefix = $ctx['entity'];
            foreach (scandir($paths['requestsDir']) ?: [] as $name) {
                if (!str_ends_with($name, '.php')) {
                    continue;
                }
                $className = substr($name, 0, -4);
                if (!str_starts_with($className, $entityPrefix)) {
                    continue;
                }
                $testPath = $paths['moduleRoot'].DIRECTORY_SEPARATOR.'Tests'.DIRECTORY_SEPARATOR.'Unit'.DIRECTORY_SEPARATOR.'Http'.DIRECTORY_SEPARATOR.'Requests'.DIRECTORY_SEPARATOR.$className.'Test.php';
                $required++;
                if (is_file($testPath)) {
                    $present++;
                }
            }
        }

        if ($required > 0 && $present === $required) {
            return [
                'satisfied' => true,
                'reason' => "workspace: structural tests {$present}/{$required} for {$ctx['entity']}",
            ];
        }

        return ['satisfied' => false, 'reason' => null];
    }

    /**
     * @param  array<string, mixed>  $ctx
     * @param  array{explicitGen?: bool}  $options
     * @return array{skip: bool, reason: ?string}
     */
    public static function shouldSkipModuleTestStub(array $ctx, array $options = []): array
    {
        if (($ctx['phase'] ?? '') === 'stub') {
            return ['skip' => false, 'reason' => null];
        }
        if (!empty($options['explicitGen'])) {
            return ['skip' => false, 'reason' => null];
        }

        $fromCodegen = self::structuralTestsSatisfiedByCodegen($ctx['codegenManifest'] ?? null);
        if ($fromCodegen['satisfied']) {
            return ['skip' => true, 'reason' => $fromCodegen['reason']];
        }

        $fromWorkspace = self::structuralTestsSatisfiedByWorkspace($ctx, (string) $ctx['repoRoot']);
        if ($fromWorkspace['satisfied']) {
            return ['skip' => true, 'reason' => $fromWorkspace['reason']];
        }

        return ['skip' => false, 'reason' => null];
    }
}
