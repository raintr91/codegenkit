<?php

declare(strict_types=1);

namespace Codegenkit\Laravel\UnitGen;

final class UnitPlanner
{
    /**
     * @param  array<string, mixed>  $spec
     * @param  array<string, mixed>  $codegenManifest
     * @param  array{phase?: string}  $options
     * @return array<string, mixed>
     */
    public static function buildUnitContext(
        array $spec,
        string $specFile,
        array $codegenManifest,
        string $repoRoot,
        array $options = []
    ): array {
        $module = $codegenManifest['module'] ?? $spec['codegen']['module'] ?? null;
        $entity = $codegenManifest['entity'] ?? $spec['codegen']['entity'] ?? null;
        $profile = $codegenManifest['profile'] ?? $spec['codegen']['profile'] ?? 'crud-standard';

        if (!$module || !$entity) {
            throw new \RuntimeException('unit-gen requires module + entity from codegen manifest or spec.codegen');
        }

        $tags = array_merge(
            $spec['tags'] ?? [],
            $codegenManifest['tags'] ?? [],
            array_map(
                static fn ($t) => '#manual-test:'.$t,
                $codegenManifest['manual']['tests'] ?? []
            )
        );
        $unitTags = ParseTags::parse($tags);
        $paths = WorkspaceInspector::resolveUnitPaths(
            ['module' => (string) $module, 'entity' => (string) $entity],
            $repoRoot
        );
        $baseRequest = WorkspaceInspector::inferModuleBaseRequest($paths['moduleRoot'], (string) $module);
        $requestClasses = WorkspaceInspector::listModuleRequestClasses($paths['requestsDir'], (string) $module);
        $behavioral = SpecExtract::buildBehavioralContext($spec, $specFile, (string) $module, (string) $entity);

        return [
            'spec' => $spec,
            'specFile' => $specFile,
            'feature' => $spec['feature']['id'] ?? null,
            'title' => $spec['feature']['title'] ?? $entity,
            'module' => (string) $module,
            'entity' => (string) $entity,
            'entityPascal' => (string) $entity,
            'profile' => (string) $profile,
            'phase' => $options['phase'] ?? 'all',
            'repoRoot' => $repoRoot,
            'codegenManifest' => $codegenManifest,
            'unitTags' => $unitTags,
            'paths' => $paths,
            'moduleNamespace' => 'Modules\\'.$module,
            'moduleBaseRequestFqcn' => $baseRequest['fqcn'],
            'moduleBaseRequestClass' => $baseRequest['className'],
            'moduleControllerFqcn' => "Modules\\{$module}\\Http\\Controllers\\{$module}Controller",
            'requestClasses' => $requestClasses,
            'requirementIds' => WorkspaceInspector::collectRequirementIds($spec),
            'manual' => $codegenManifest['manual'] ?? ['actions' => [], 'services' => [], 'tests' => []],
            'behavioral' => $behavioral,
        ];
    }

    /**
     * @param  array<string, mixed>  $ctx
     * @param  array<string, mixed>  $registry
     * @return array{files: list<array<string, mixed>>, commands: list<array<string, mixed>>, needsUnit: list<array<string, mixed>>, skippedPatterns: list<array<string, mixed>>}
     */
    public static function buildUnitPlan(array $ctx, array $registry): array
    {
        $files = [];
        $commands = [];
        $needsUnit = [];
        $skippedPatterns = [];
        $phases = self::resolvePhases((string) $ctx['phase'], $registry);

        foreach (self::listPatternsForPhases($registry, $phases) as $patternId) {
            $pattern = UnitRegistry::getPattern($registry, $patternId);
            self::appendPatternPlan($ctx, $registry, $patternId, $pattern, $files, $commands, $needsUnit, $skippedPatterns);
        }

        self::appendExplicitNeeds($ctx, $needsUnit);

        return [
            'files' => $files,
            'commands' => $commands,
            'needsUnit' => self::dedupeNeedsUnit($needsUnit),
            'skippedPatterns' => $skippedPatterns,
        ];
    }

    /** @param array<string, mixed> $registry @return list<string> */
    private static function resolvePhases(string $phaseOption, array $registry): array
    {
        if ($phaseOption === 'stub') {
            return $registry['defaults']['phaseStub'] ?? ['moduleTest.stub'];
        }
        if ($phaseOption === 'enriched') {
            return $registry['defaults']['phaseEnriched'] ?? [];
        }
        if ($phaseOption === 'behavioral') {
            return $registry['defaults']['phaseBehavioral'] ?? [];
        }

        return array_merge(
            $registry['defaults']['phaseStub'] ?? [],
            $registry['defaults']['phaseEnriched'] ?? [],
            $registry['defaults']['phaseBehavioral'] ?? []
        );
    }

    /** @param array<string, mixed> $registry @param list<string> $phases @return list<string> */
    private static function listPatternsForPhases(array $registry, array $phases): array
    {
        $ids = [];
        $seen = [];
        foreach ($registry['patterns'] ?? [] as $id => $pattern) {
            if (!in_array($id, $phases, true) && !in_array($pattern['phase'] ?? null, $phases, true)) {
                continue;
            }
            if (isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            $ids[] = (string) $id;
        }

        return $ids;
    }

    /** @param array<string, mixed> $unitTags @param array<string, mixed> $pattern */
    private static function hasExplicitGenForPattern(array $unitTags, string $patternId, array $pattern): bool
    {
        $keys = array_values(array_filter([ParseTags::patternGenKey($patternId), $pattern['genTag'] ?? null]));
        foreach ($keys as $key) {
            if (ParseTags::hasExplicitGenTag($unitTags, (string) $key)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $ctx
     * @param  array<string, mixed>  $registry
     * @param  array<string, mixed>  $pattern
     * @param  list<array<string, mixed>>  $files
     * @param  list<array<string, mixed>>  $commands
     * @param  list<array<string, mixed>>  $needsUnit
     * @param  list<array<string, mixed>>  $skippedPatterns
     */
    private static function appendPatternPlan(
        array $ctx,
        array $registry,
        string $patternId,
        array $pattern,
        array &$files,
        array &$commands,
        array &$needsUnit,
        array &$skippedPatterns
    ): void {
        unset($registry);
        $layer = (string) ($pattern['layer'] ?? explode('.', $patternId)[0]);

        if (ParseTags::isLayerSkipped($ctx['unitTags'], $layer)) {
            $skippedPatterns[] = ['patternId' => $patternId, 'reason' => '#skip-unit-test:'.$layer];

            return;
        }

        if (!empty($pattern['profiles']) && !in_array($ctx['profile'], $pattern['profiles'], true)) {
            return;
        }

        $explicit = self::hasExplicitGenForPattern($ctx['unitTags'], $patternId, $pattern);
        $inDefaultPhase = $ctx['phase'] === 'all' || $ctx['phase'] === ($pattern['phase'] ?? null);
        $whenMatched = WhenEval::matchesPatternWhen($ctx, $pattern['when'] ?? null);

        if (($pattern['status'] ?? null) !== 'implemented') {
            if (self::shouldEmitPlannedNeed($ctx, $pattern, $explicit, $inDefaultPhase, $whenMatched)) {
                $needsUnit[] = self::buildNeed($ctx, $pattern, $patternId, "pattern {$patternId} status={$pattern['status']}");
            }

            return;
        }

        if ($patternId === 'moduleTest.stub') {
            $skipStub = WorkspaceInspector::shouldSkipModuleTestStub($ctx, ['explicitGen' => $explicit]);
            if ($skipStub['skip']) {
                $skippedPatterns[] = [
                    'patternId' => $patternId,
                    'reason' => $skipStub['reason'],
                    'artisan' => UnitRegistry::expandCommand((string) $pattern['command'], $ctx),
                ];

                return;
            }
            $commands[] = [
                'id' => 'module-test-stub',
                'patternId' => $patternId,
                'layer' => $layer,
                'artisan' => UnitRegistry::expandCommand((string) $pattern['command'], $ctx),
                'reqIds' => $ctx['requirementIds'],
            ];

            return;
        }

        if (!$whenMatched) {
            return;
        }

        if ($patternId === 'request.validationHooks') {
            self::appendRequestHookFiles($ctx, $pattern, $patternId, $files);

            return;
        }

        if ($patternId === 'controller.invokeAll') {
            self::appendSingleFile($ctx, $pattern, $patternId, $files, [
                'controllerFqcn' => "Modules\\{$ctx['module']}\\Http\\Controllers\\{$ctx['entity']}Controller",
                'entityQueryFqcn' => "Modules\\{$ctx['module']}\\Http\\Queries\\{$ctx['entity']}Query",
                'entityActionFqcn' => "Modules\\{$ctx['module']}\\Http\\Actions\\{$ctx['entity']}Action",
            ]);

            return;
        }

        if (($pattern['phase'] ?? null) === 'behavioral') {
            self::appendBehavioralFile($ctx, $pattern, $patternId, $files);

            return;
        }

        self::appendSingleFile($ctx, $pattern, $patternId, $files, []);
    }

    /** @param array<string, mixed> $ctx @param array<string, mixed> $pattern @param list<array<string, mixed>> $files */
    private static function appendBehavioralFile(array $ctx, array $pattern, string $patternId, array &$files): void
    {
        $behavioral = $ctx['behavioral'];
        if ($patternId === 'query.chainScope' && empty($behavioral['sessionScopeColumn'])) {
            return;
        }
        if ($patternId === 'action.relationshipSync' && empty($behavioral['relationshipNames'])) {
            return;
        }
        if ($patternId === 'resource.nestedRelations' && empty($behavioral['hasManyRelations'])) {
            return;
        }

        $files[] = [
            'patternId' => $patternId,
            'layer' => $pattern['layer'],
            'template' => $pattern['template'],
            'relativePath' => UnitRegistry::resolveOutputPath((string) $pattern['output'], $ctx),
            'reqIds' => $ctx['requirementIds'],
            'context' => $behavioral,
        ];
    }

    /** @param array<string, mixed> $ctx @param array<string, mixed> $pattern */
    private static function shouldEmitPlannedNeed(
        array $ctx,
        array $pattern,
        bool $explicit,
        bool $inDefaultPhase,
        bool $whenMatched
    ): bool {
        if (!$whenMatched && isset($pattern['when'])) {
            return false;
        }
        if ($explicit) {
            return true;
        }
        if (($pattern['phase'] ?? null) === 'behavioral' && $inDefaultPhase) {
            return true;
        }
        if ($ctx['phase'] === 'behavioral' || $ctx['phase'] === 'all') {
            return true;
        }

        return false;
    }

    /** @param array<string, mixed> $ctx @param array<string, mixed> $pattern @param list<array<string, mixed>> $files */
    private static function appendRequestHookFiles(array $ctx, array $pattern, string $patternId, array &$files): void
    {
        $classes = $ctx['requestClasses'] !== []
            ? $ctx['requestClasses']
            : [$ctx['entity'].'SearchRequest', $ctx['entity'].'CreateRequest'];

        foreach (array_values(array_unique($classes)) as $requestClass) {
            $ctxWithRequest = array_merge($ctx, ['requestClass' => $requestClass]);
            $files[] = [
                'patternId' => $patternId,
                'layer' => $pattern['layer'],
                'template' => $pattern['template'],
                'relativePath' => UnitRegistry::resolveOutputPath((string) $pattern['output'], $ctxWithRequest),
                'reqIds' => $ctx['requirementIds'],
                'context' => [
                    'requestClass' => $requestClass,
                    'requestFqcn' => "Modules\\{$ctx['module']}\\Http\\Requests\\{$requestClass}",
                    'targetRelativePath' => "Modules/{$ctx['module']}/Http/Requests/{$requestClass}.php",
                ],
            ];
        }
    }

    /**
     * @param  array<string, mixed>  $ctx
     * @param  array<string, mixed>  $pattern
     * @param  list<array<string, mixed>>  $files
     * @param  array<string, mixed>  $extraContext
     */
    private static function appendSingleFile(
        array $ctx,
        array $pattern,
        string $patternId,
        array &$files,
        array $extraContext
    ): void {
        $files[] = [
            'patternId' => $patternId,
            'layer' => $pattern['layer'],
            'template' => $pattern['template'],
            'relativePath' => UnitRegistry::resolveOutputPath((string) $pattern['output'], $ctx),
            'reqIds' => $ctx['requirementIds'],
            'context' => $extraContext,
        ];
    }

    /** @param array<string, mixed> $ctx @param array<string, mixed> $pattern @return array<string, mixed> */
    private static function buildNeed(array $ctx, array $pattern, string $patternId, string $reason): array
    {
        $tag = UnitRegistry::expandTagTemplate(
            (string) ($pattern['fallbackTag'] ?? '#needs-unit-test:'.$pattern['layer'].':'.$ctx['entity']),
            $ctx
        );

        return [
            'tag' => $tag,
            'reason' => $reason,
            'patternId' => $patternId,
            'layer' => $pattern['layer'],
            'reqIds' => $ctx['requirementIds'],
        ];
    }

    /** @param array<string, mixed> $ctx @param list<array<string, mixed>> $needsUnit */
    private static function appendExplicitNeeds(array $ctx, array &$needsUnit): void
    {
        foreach ($ctx['unitTags']['needs'] as $tag) {
            $exists = false;
            foreach ($needsUnit as $n) {
                if (($n['tag'] ?? null) === $tag) {
                    $exists = true;
                    break;
                }
            }
            if (!$exists) {
                $needsUnit[] = [
                    'tag' => $tag,
                    'reason' => 'explicit in spec tags',
                    'reqIds' => $ctx['requirementIds'],
                ];
            }
        }
    }

    /** @param list<array{tag: string}> $items @return list<array{tag: string}> */
    private static function dedupeNeedsUnit(array $items): array
    {
        $seen = [];
        $out = [];
        foreach ($items as $item) {
            $tag = $item['tag'];
            if (isset($seen[$tag])) {
                continue;
            }
            $seen[$tag] = true;
            $out[] = $item;
        }

        return $out;
    }
}
