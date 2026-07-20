<?php

declare(strict_types=1);

namespace Codegenkit\Laravel\UnitGen;

final class ArtisanRunner
{
    /**
     * @param  array{dryRun?: bool}  $options
     * @return array{code: int, stdout: string, stderr: string}
     */
    public static function run(string $artisanLine, string $laravelRoot, array $options = []): array
    {
        $line = preg_replace('/^php artisan\s+/', '', trim($artisanLine)) ?? trim($artisanLine);
        if (!empty($options['dryRun'])) {
            return ['code' => 0, 'stdout' => "[dry-run] php artisan {$line}", 'stderr' => ''];
        }

        $php = getenv('CODEGENKIT_PHP') ?: 'php';
        $args = self::splitCommand($line);
        $command = array_merge([$php, 'artisan'], $args);

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        $proc = proc_open($command, $descriptors, $pipes, $laravelRoot, null);
        if (!is_resource($proc)) {
            return ['code' => 1, 'stdout' => '', 'stderr' => 'Failed to spawn artisan'];
        }
        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]) ?: '';
        $stderr = stream_get_contents($pipes[2]) ?: '';
        fclose($pipes[1]);
        fclose($pipes[2]);
        $code = proc_close($proc);

        return ['code' => $code, 'stdout' => $stdout, 'stderr' => $stderr];
    }

    /** @return list<string> */
    private static function splitCommand(string $line): array
    {
        $args = [];
        if (preg_match_all('/"((?:\\\\.|[^"])*)"|\'((?:\\\\.|[^\'])*)\'|([^\s]+)/', $line, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $raw = $match[1] !== '' ? $match[1] : ($match[2] !== '' ? $match[2] : $match[3]);
                $args[] = preg_replace('/\\\\(["\'])/', '$1', $raw) ?? $raw;
            }
        }

        return $args;
    }
}
