<?php

declare(strict_types=1);

spl_autoload_register(static function (string $class): void {
    $prefix = 'Codegenkit\\Laravel\\UnitGen\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = str_replace('\\', '/', substr($class, strlen($prefix)));
    $file = dirname(__DIR__).'/src/'.$relative.'.php';
    if (is_file($file)) {
        require_once $file;
    }
});
