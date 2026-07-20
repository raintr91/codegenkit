# Testgen → Testkit handoff

`testgen` (E2E / testcase generation formerly under product-root and
`drafts/{next_nest,nuxt_nest}/testgen`) is **not** owned by Codegenkit.

## Destination

Promote into **Testkit** as the SSOT for testcase/E2E generation. Codegenkit
keeps FE `unitgen` (component/service unit tests) and BE `api-unit-gen` only.

## Snapshot retained for Testkit import

A copy of the last Codegenkit draft tree was left at review time under
`drafts/` before deletion. If this file is all that remains, recover history
from git:

- `drafts/next_nest/testgen/`
- `drafts/nuxt_nest/testgen/`
- related registries: `e2e-test.registry.json`

## Callers to rewire in product repos

- `testgen/runners/generate.mjs`
- imports of `codegen/runners/lib/read-spec.mjs` / `resolve-hub-id.mjs`
  (those libs stay in Codegenkit FE adapters; Testkit should depend on the
  toolkit CLI or shared docs-root resolution, not product-root copies)
