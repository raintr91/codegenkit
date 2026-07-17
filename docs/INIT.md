# `codegenkit init`

```bash
codegenkit init --type=fe --adapter=nuxt4 --target=cursor --docs-root=/path/to/docs-hub --yes
codegenkit init --type=fe --adapter=nextjs --yes
```

Only `--type=fe` is supported. Docs/tests profiles must not install Codegenkit.

`init` writes machine-local `.cursor/mcp.json`, syncs FE skills, and merges owned
skill IDs into `platform-repos.json`. Product registries remain in the FE repo.
