---
name: platform-ai
description: /platform-ai — build and maintain the independent Codegenkit MCP package.
disable-model-invocation: true
---

# /platform-ai — build Codegenkit MCP

Use this skill to design, implement, test, package, and release Codegenkit as
one independent multi-lane FE/BE MCP. Do not implement product features here.

## Scope

- Own Codegenkit tools, CLI/API, adapters, registries, generators, harness,
  tests, and docs.
- Keep lane and adapter selection explicit during `init`.
- Keep generation deterministic and adapter-owned.
- Do not keep `platform-repos.json`, Platform DNA assets, or sibling topology.

## Workflow

1. Freeze tool, adapter, and ownership contracts in `mcp-package.json`.
2. Implement behavior in `src/`, adapters, and package-owned `harness/`.
3. Keep `init` managed-hash protected and validate adapter compatibility.
4. Test generated output from clean standalone fixtures.
5. Run `pnpm test` and `pnpm pack --dry-run` before release.

## Done

- FE/BE adapters work without sibling repositories.
- Shipped files contain only Codegenkit-owned assets.
- Generated files and destination harness changes are ownership-safe.
- Version, registries, docs, and tests agree.
