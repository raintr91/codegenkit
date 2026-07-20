<?php

declare(strict_types=1);

namespace Codegenkit\Laravel\UnitGen;

final class ParseTags
{
    private const GEN_TEST = '#gen:test-';
    private const NEEDS_UNIT = '#needs-unit-test:';
    private const SKIP_UNIT = '#skip-unit-test:';
    private const TEST_MOCK = '#test-mock:';

    /**
     * @param  list<string>  $tags
     * @return array{gen: array<string, true>, skip: array<string, true>, needs: list<string>, mocks: list<string>, raw: list<string>}
     */
    public static function parse(array $tags = []): array
    {
        $parsed = [
            'gen' => [],
            'skip' => [],
            'needs' => [],
            'mocks' => [],
            'raw' => $tags,
        ];

        foreach ($tags as $tag) {
            $text = trim((string) $tag);
            if (str_starts_with($text, self::GEN_TEST)) {
                $parsed['gen'][trim(substr($text, strlen(self::GEN_TEST)))] = true;
            } elseif (str_starts_with($text, self::SKIP_UNIT)) {
                $parsed['skip'][strtolower(trim(substr($text, strlen(self::SKIP_UNIT))))] = true;
            } elseif (str_starts_with($text, self::NEEDS_UNIT)) {
                $parsed['needs'][] = $text;
            } elseif (str_starts_with($text, self::TEST_MOCK)) {
                $parsed['mocks'][] = trim(substr($text, strlen(self::TEST_MOCK)));
            }
        }

        return $parsed;
    }

    /** @param array{skip: array<string, true>} $unitTags */
    public static function isLayerSkipped(array $unitTags, string $layer): bool
    {
        $key = strtolower($layer);

        return isset($unitTags['skip'][$key]) || isset($unitTags['skip']['all']);
    }

    /** @param array{gen: array<string, true>} $unitTags */
    public static function hasExplicitGenTag(array $unitTags, string $genKey): bool
    {
        return isset($unitTags['gen'][$genKey]);
    }

    public static function patternGenKey(string $patternId): string
    {
        return str_replace('.', '-', $patternId);
    }
}
