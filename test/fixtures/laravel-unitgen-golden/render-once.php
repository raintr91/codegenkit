<?php
require "/home/vutv/workspace/codegenkit/adapters/laravel/php/src/Autoload.php";
use Codegenkit\Laravel\UnitGen\TemplateRenderer;
$ctx = json_decode(file_get_contents("/home/vutv/workspace/codegenkit/test/fixtures/laravel-unitgen-golden/ctx.json"), true);
echo TemplateRenderer::render("support/ModuleTestSupport.php.stub", $ctx);
