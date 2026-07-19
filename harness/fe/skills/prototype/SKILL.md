---
name: prototype
description: /prototype — UI from docs-hub ir/spec with mock API via Codegenkit.
disable-model-invocation: true
---

# /prototype — UI Prototype (Mock API Boundary)

**Owner:** Codegenkit (`--type=fe`) · Adapters: `nuxt4` | `nextjs` | `dotnet-line`

## Artifact

Load docs-hub Code `ir/spec.yaml` via `--id` (for example `W-AD-AUTH-001`):

```text
product/components/{CMP-…}/code/{W-…}/ir/spec.yaml
```

Do not invent sibling docs-hub paths. Pass `CODEGENKIT_DOCS_ROOT` or
`--docs-root`; this is the only bridge to canonical docs IR/registries.
ArtifactGraph installed in FE is local-only and must not substitute for this
pointer.

## Route

Architecture/C4 → Hubdocs (`HUBDOCS_ROOT`); IR/registry/gen →
`CODEGENKIT_DOCS_ROOT`; symbols/call-graph for repo X → Platform DNA-wired
`codegraph-<repo-key>`. Never workspace-parent graphs, sibling-path inference,
or member-edited MCP. Local ArtifactGraph is allowlist/tag hints for this repo
only.

## Workflow

```bash
codegenkit gen:dry --adapter=nuxt4 --docs-root=/path/to/docs-hub -- --id W-AD-AUTH-001
codegenkit gen --adapter=nuxt4 --docs-root=/path/to/docs-hub -- --id W-AD-AUTH-001

codegenkit gen:dry --adapter=dotnet-line -- --spec ir/spec.yaml
codegenkit gen --adapter=dotnet-line -- --spec ir/spec.yaml
codegenkit registry --adapter=dotnet-line
```

Compatibility shims on FE repos may still expose `pnpm portal:gen*`; they must call Codegenkit.

`dotnet-line` requires the .NET 8 SDK (`CODEGENKIT_DOTNET`, then `dotnet`) and
is limited to the pilot-specific `kiosk-check-in` profile. Its main pass also
emits generated test source.

## Accelerators (optional)

```text
if local ArtifactGraph available: recommend/check the FE repo's allowlisted gen command
else: run codegenkit gen:dry / gen directly

Missing ArtifactGraph never blocks prototype generation. Complete the direct,
deterministic Codegenkit fallback first, then follow
`.cursor/rules/codegenkit-optional-integrations.mdc` for once-per-run telemetry.
```

Docs render / `spec:split` remain docs-hub / Bundlekit handoffs.
