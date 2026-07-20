# portal:unit-gen

Reads hub Code `ir/spec.yaml` + `generated/codegen.manifest.json` (after `codegenkit gen`) → writes `tests/unit/`.

```bash
codegenkit unit-gen:dry --id W-AD-AUTH-001
codegenkit unit-gen --id W-AD-AUTH-001
codegenkit unit-gen --id W-AD-AUTH-001 --force
codegenkit unit-gen --spec /path/to/docs-hub/product/components/CMP-01-auth/code/W-AD-AUTH-001/ir/spec.yaml
```

Manifest / UNIT-HANDOFF: `base-docs/…/code/{W-…}/generated/`.
