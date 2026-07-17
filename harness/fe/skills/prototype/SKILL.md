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

Do not invent sibling docs-hub paths. Pass `CODEGENKIT_DOCS_ROOT` or `--docs-root`.

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
if ArtifactGraph available: recommend/check allowlisted gen command
else: run codegenkit gen:dry / gen directly

Missing ArtifactGraph never blocks prototype generation. Complete the direct,
deterministic Codegenkit fallback first, then follow
`.cursor/rules/codegenkit-optional-integrations.mdc` for once-per-run telemetry.
```

Docs render / `spec:split` remain docs-hub / Bundlekit handoffs.
