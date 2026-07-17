# `codegenkit init`

```bash
codegenkit init --type=fe --adapter=nuxt4 --target=cursor --docs-root=/path/to/docs-hub --yes
codegenkit init --type=fe --adapter=nextjs --yes
codegenkit init --type=be --adapter=fastapi --yes
codegenkit init --type=be --adapter=laravel --yes
codegenkit init --type=fullstack --fe-adapter=nuxt4 --be-adapter=fastapi --yes
```

Supported profiles are `fe`, `be`, and explicit `fullstack`. Docs/tests
profiles must not install Codegenkit.

`init` writes machine-local `.cursor/mcp.json`, syncs only selected lane skills,
and merges owned skill IDs into `platform-repos.json`. Product registries remain
in the target code repository.
