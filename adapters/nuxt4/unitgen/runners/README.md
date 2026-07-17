# portal:unit-gen

Reads hub Code `ir/spec.yaml` + `generated/codegen.manifest.json` (after `portal:gen`) → writes `tests/unit/`.

```bash
pnpm portal:unit-gen:dry --id W-AD-AUTH-001
pnpm portal:unit-gen --id W-AD-AUTH-001
pnpm portal:unit-gen --id W-AD-AUTH-001 --force
pnpm portal:unit-gen --spec ../base-docs/product/components/CMP-01-auth/code/W-AD-AUTH-001/ir/spec.yaml
```

Manifest / UNIT-HANDOFF: `base-docs/…/code/{W-…}/generated/`.
