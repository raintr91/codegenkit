# Laravel PHP unitgen

Source of truth for the Laravel BE unit-test generator. Synced by
`codegenkit init --type=be --adapter=laravel` into the product checkout at
`src/.codegenkit/` (gitignored, owned by `.codegenkit/install-manifest.json`).

## Run

```bash
cd src   # Laravel app root (artisan + composer.json)
php .codegenkit/bin/unit-gen.php --spec <base-docs>/…/01-backend-spec.yaml [--dry-run] [--force] [--phase all]
```

Or via toolkit CLI (spawns the synced engine):

```bash
codegenkit api-unit-gen --adapter=laravel -- --spec <path>
```

## Dependency

Product `composer.json` must include `symfony/yaml` in `require-dev` (used to
parse `01-backend-spec.yaml` / `02-openapi.yaml`).

Registries stay at product-root `registries/unit-test.registry.json` (also
synced by init from `adapters/laravel/registries/`).
