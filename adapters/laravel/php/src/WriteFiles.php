<?php

declare(strict_types=1);

namespace Codegenkit\Laravel\UnitGen;

final class WriteFiles
{
    /**
     * @param  list<array{relativePath: string, content: string, layer: string, patternId: string}>  $outputs
     * @param  array{dryRun?: bool, force?: bool}  $options
     * @return array{written: list<array<string, mixed>>, skipped: list<array<string, mixed>>}
     */
    public static function writeOutputs(string $repoRoot, array $outputs, array $options = []): array
    {
        $written = [];
        $skipped = [];
        $force = !empty($options['force']);
        $dryRun = !empty($options['dryRun']);

        foreach ($outputs as $output) {
            $absolutePath = ProjectResolver::assertContained(
                $repoRoot,
                $repoRoot.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $output['relativePath']),
                'unit output'
            );

            if (!$force && is_file($absolutePath)) {
                $skipped[] = ['relativePath' => $output['relativePath'], 'reason' => 'exists (use --force)'];
                continue;
            }

            if (!$dryRun) {
                $dir = dirname($absolutePath);
                if (!is_dir($dir)) {
                    mkdir($dir, 0777, true);
                }
                file_put_contents($absolutePath, $output['content']);
            }

            $written[] = ['relativePath' => $output['relativePath'], 'dryRun' => $dryRun];
        }

        return ['written' => $written, 'skipped' => $skipped];
    }

    /**
     * @param  array<string, mixed>  $manifest
     * @param  array{dryRun?: bool}  $options
     * @return array{manifestPath: string, handoffPath: string}
     */
    public static function writeUnitMeta(
        string $featureDir,
        array $manifest,
        string $handoffMarkdown,
        array $options = []
    ): array {
        $manifestPath = $featureDir.DIRECTORY_SEPARATOR.'generated'.DIRECTORY_SEPARATOR.'unit.manifest.json';
        $handoffPath = $featureDir.DIRECTORY_SEPARATOR.'generated'.DIRECTORY_SEPARATOR.'UNIT-HANDOFF.md';

        if (!empty($options['dryRun'])) {
            return ['manifestPath' => $manifestPath, 'handoffPath' => $handoffPath];
        }

        $dir = dirname($manifestPath);
        if (!is_dir($dir)) {
            mkdir($dir, 0777, true);
        }
        file_put_contents(
            $manifestPath,
            json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n"
        );
        file_put_contents($handoffPath, $handoffMarkdown);

        return ['manifestPath' => $manifestPath, 'handoffPath' => $handoffPath];
    }

    /**
     * @param  array<string, mixed>  $ctx
     * @param  list<array<string, mixed>>  $written
     * @param  list<array<string, mixed>>  $skipped
     * @param  list<array<string, mixed>>  $needsUnit
     * @param  list<array<string, mixed>>  $commands
     * @param  list<array<string, mixed>>  $skippedPatterns
     */
    public static function renderUnitHandoffMarkdown(
        array $ctx,
        array $written,
        array $skipped,
        array $needsUnit,
        array $commands,
        array $skippedPatterns = []
    ): string {
        $testPaths = array_map(static fn ($w) => $w['relativePath'], $written);
        $filterHint = $ctx['entity'];
        $lines = [
            '# UNIT HANDOFF — '.$ctx['title'],
            '',
            'Generated from `'.basename((string) $ctx['specFile']).'` (profile: **'.$ctx['profile'].'**, phase: **'.$ctx['phase'].'**).',
            '',
            'Prerequisite: `codegenkit api-gen` + `generated/codegen.manifest.json`.',
            '',
            '## Commands (stub layer)',
            '',
        ];

        if ($commands !== []) {
            foreach ($commands as $c) {
                $lines[] = '- `php artisan '.$c['artisan'].'`';
            }
        } else {
            $lines[] = '- _No artisan commands planned._';
        }
        $lines[] = '';

        if ($skippedPatterns !== []) {
            $lines[] = '## Skipped patterns';
            $lines[] = '';
            foreach ($skippedPatterns as $item) {
                $extra = !empty($item['artisan']) ? ' (`'.$item['artisan'].'`)' : '';
                $lines[] = '- `'.$item['patternId'].'` — '.$item['reason'].$extra;
            }
            $lines[] = '';
        }

        $lines[] = '## Test files';
        $lines[] = '';
        if ($written !== []) {
            foreach ($written as $f) {
                $dry = !empty($f['dryRun']) ? ' (dry-run)' : '';
                $lines[] = '- `'.$f['relativePath'].'`'.$dry;
            }
        } else {
            $lines[] = '- _No template files written._';
        }
        $lines[] = '';

        if ($skipped !== []) {
            $lines[] = '## Skipped (already exist)';
            $lines[] = '';
            foreach ($skipped as $s) {
                $lines[] = '- `'.$s['relativePath'].'` — '.$s['reason'];
            }
            $lines[] = '';
        }

        $lines[] = '## Verify';
        $lines[] = '';
        $lines[] = '```bash';
        $lines[] = 'php artisan test --testsuite=Module'.$ctx['module'];
        $lines[] = $testPaths !== []
            ? 'php artisan test '.implode(' ', $testPaths)
            : 'php artisan test --filter='.$filterHint;
        $lines[] = '```';
        $lines[] = '';

        if ($needsUnit !== []) {
            $lines[] = '## Unit next — #needs-unit-test';
            $lines[] = '';
            foreach ($needsUnit as $item) {
                $lines[] = '- `'.$item['tag'].'` — '.$item['reason'];
            }
            $lines[] = '';
        }

        return implode("\n", $lines);
    }

    /**
     * @param  list<array<string, mixed>>  $files
     * @param  array<string, mixed>  $ctx
     * @return list<array{relativePath: string, content: string, layer: string, patternId: string}>
     */
    public static function renderFileOutputs(array $files, array $ctx): array
    {
        $outputs = [];
        foreach ($files as $file) {
            $context = array_merge($ctx, $file['context'] ?? [], [
                'moduleNamespace' => $ctx['moduleNamespace'],
                'moduleBaseRequestFqcn' => $ctx['moduleBaseRequestFqcn'],
                'moduleBaseRequestClass' => $ctx['moduleBaseRequestClass'],
                'moduleControllerFqcn' => $ctx['moduleControllerFqcn'],
            ]);
            $outputs[] = [
                'relativePath' => $file['relativePath'],
                'content' => TemplateRenderer::render((string) $file['template'], $context),
                'layer' => (string) $file['layer'],
                'patternId' => (string) $file['patternId'],
            ];
        }

        return $outputs;
    }
}
