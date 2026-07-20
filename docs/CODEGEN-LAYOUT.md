# Codegen layout (global)

> Contract owner: **Codegenkit**. Engines live in the toolkit package
> (`adapters/<stack>/…`) and are invoked via the Codegenkit CLI. Product checkouts
> do **not** keep root `codegen/` / `unitgen/` trees after init.

## Product checkout (after `codegenkit init`)

```text
<checkout>/
  .cursor/                     # harness skills/rules (synced)
  .codegenkit/
    install-manifest.json      # ownership / sha for synced files
  registries/                  # BE adapter registries (when applicable)
  src/.codegenkit/             # Laravel only — PHP unitgen engine (synced, gitignored)
    bin/unit-gen.php
    src/
    templates/
```

## Toolkit SSOT (this package)

```text
adapters/
  laravel/
    codegen/                   # Node planner (api-gen) — runs from package
    php/                       # PHP unitgen — synced → src/.codegenkit/
    registries/
  nestjs/{nestgen,nest-unitgen}/  # Nest scaffold + unit — runs from package
  fastapi/{codegen,unitgen}/   # Python — runs from package via PYTHONPATH
  nuxt4/{codegen,unitgen}/     # Node — runs from package
  nextjs/{codegen,unitgen,contractgen}/
  nextjs/registries/contract-field.registry.json  # synced on FE nextjs init
```

Legacy product-root layout (`codegen/`, `unitgen/`, `nestgen/`, …) is retired;
prefer toolkit CLI commands below.

## Commands

| Stack | Gen | Unit / registry |
|-------|-----|-----------------|
| nuxt4 / nextjs FE | `codegenkit gen --adapter=…` | `codegenkit unit-gen --adapter=…` |
| FastAPI | `codegenkit api-gen --adapter=fastapi` | `codegenkit api-unit-gen --adapter=fastapi` |
| Laravel | `codegenkit api-gen --adapter=laravel` | `codegenkit api-unit-gen --adapter=laravel` (PHP in `src/.codegenkit/`) |
| NestJS | `codegenkit api-gen --adapter=nestjs` | `codegenkit api-unit-gen --adapter=nestjs` |
| Contract (Next monorepo) | `codegenkit contract-gen` | `codegenkit contract-registry` |
| integration | `codegenkit api-gen --adapter=dotnet-integration` | (bundled in api-gen) |

Laravel unitgen requires `symfony/yaml` in the product `composer.json` `require-dev`.

Hub lệnh: [Feature artifact commands](https://github.com/raintr91/base_docs/blob/1.0.0/platform/toolchain/FEATURE-ARTIFACT-COMMANDS.md) · mark: [Platform mark](https://github.com/raintr91/base_docs/blob/1.0.0/platform/toolchain/PLATFORM-MARK.md)
