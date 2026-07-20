# Draft Integration review (2026-07-20)

Parity review of archived `draft/integration/` vs `adapters/dotnet-integration/` — **draft deleted**.

| Area | Verdict |
|------|---------|
| Templates set | Same files (Application / Infrastructure / Presenter / Tests + handoff). Registry lists `Endpoint` but engine does **not** emit an Endpoint template (same as draft) |
| Diff content | Adapter was **ahead** (`CODEGENKIT_ROOT` containment, clearer Program.cs / handoff / presenter / service_test) |
| Python `integration_gen/` | Fully superseded (`DEPRECATED.md`); deleted with draft |
| Compatibility shim | Superseded by toolkit CLI |
| Product `integration` | No root `codegen/`; `Integration.sln` has no `IntegrationGen`; registries match `mes-downtime`; README points at CLI |

Canonical:

```bash
codegenkit api-gen:dry --adapter=dotnet-integration --project-root ~/workspace/integration -- --spec <path>
codegenkit api-gen --adapter=dotnet-integration --project-root ~/workspace/integration -- --spec <path>
codegenkit api-registry --adapter=dotnet-integration --project-root ~/workspace/integration
```
