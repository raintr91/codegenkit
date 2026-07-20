---
name: openapi
description: /openapi — OpenAPI schema generation for backend spec mapping through Codegenkit.
disable-model-invocation: true
---

# /openapi — OpenAPI Generation

**Owner:** Codegenkit (`--type=docs`)  
**Adapters:** `nestjs` · `fastapi` · `laravel`

## Generate

```bash
# Generate OpenAPI document from spec (NestJS adapter)
codegenkit api-gen --adapter=nestjs -- --openapi --spec /path/to/ir/spec.yaml

# Generate OpenAPI document with dry-run
codegenkit api-gen --adapter=nestjs -- --openapi --spec /path/to/ir/spec.yaml --dry-run

# Force overwrite of manually modified files
codegenkit api-gen --adapter=nestjs -- --openapi --spec /path/to/ir/spec.yaml --force
```

## Route

The output file is generated directly in the backend's directory as `backend/02-openapi.yaml`. This acts as the pre-code API contract review checkpoint before generating actual controller and service files.

When running `init` with the `docs` lane, make sure you configure the appropriate backend adapter (technology) to use correct routing structures and dev server ports.
