# Draft Line review (2026-07-20)

Parity review of archived `draft/line/` vs `adapters/dotnet-line/` — **draft deleted**.

| Area | Verdict |
|------|---------|
| Templates set | Same files (no Form scriban in either — registry lists Form but engine emits ViewModel/Service/tests/handoff only) |
| Diff content | Adapter was **ahead** (CODEGENKIT_ROOT containment, registry filename `dotnet-line.codegen.registry.json`, clearer handoff / test naming) |
| Compatibility shim | Superseded by toolkit CLI |
| Product `line` | `codegen/` removed; `Line.sln` no longer references LineGen; README points at CLI |

Canonical:

```bash
codegenkit gen:dry --adapter=dotnet-line --project-root ~/workspace/line -- --spec <path>
codegenkit registry --adapter=dotnet-line --project-root ~/workspace/line
```
