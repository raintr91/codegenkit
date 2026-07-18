# Codegen layout (global)

> Contract owner: **Codegenkit**. Folder names are **shared across platform-bases**. File engines differ by stack (HBS / Jinja / stub / Scriban).

## Layout

```text
<repo>/
  codegen/                 # app / API scaffold
    templates/
    runners/
  unitgen/                 # unit test gen (if any)
    templates/
    runners/
  testgen/                 # E2E / testcase gen (FE)
    templates/
    runners/
  contractgen/             # FE↔BE contract (monorepo / nextjs)
  nestgen/                 # NestJS scaffold
  nest-unitgen/
  openapigen/
  registries/              # hashtag / design / codegen SSOT JSON
    design.registry.json
    common.registry.json
    unit-test.registry.json
    e2e-test.registry.json
    codegen.registry.json  # BE stacks
    …
```

`scripts/` giữ CLI phụ (`spec/*`, lifecycle) — **không** chứa gen packages.

## Commands (tên pnpm/Make giữ nguyên)

| Stack | Gen | Registry |
|-------|-----|----------|
| portal / nextjs / FE monorepo | `pnpm portal:gen` → `codegen/runners/generate.mjs` | `pnpm portal:registry` |
| | `pnpm portal:unit-gen` → `unitgen/runners/` | `pnpm portal:unit-registry` |
| | `pnpm testcase:gen` → `testgen/runners/` | `pnpm portal:e2e-registry` |
| Nest monorepo | `pnpm nest:gen` → `nestgen/runners/` | `pnpm nest:registry` |
| fast-api-base | `./codegen/runners/generate` | `./codegen/runners/generate registry` |
| api (Laravel) | `pnpm api:gen` → `codegen/runners/` | `pnpm api:registry` |
| integration / line | `./codegen/runners/generate` | `… registry` |

## Repos

portal · nextjs · nuxt_nest · next_nest · fast-api-base · api · integration · line

Hub lệnh: [Feature artifact commands](https://github.com/raintr91/base_docs/blob/1.0.0/platform/toolchain/FEATURE-ARTIFACT-COMMANDS.md) · mark: [Platform mark](https://github.com/raintr91/base_docs/blob/1.0.0/platform/toolchain/PLATFORM-MARK.md)
