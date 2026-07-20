# Staging / trash review (2026-07-20)

Parity review against kit SSOT. **No product-only behavior was ported** — kit
adapters already include the retained kit adaptations (`CODEGENKIT_*` env,
stricter IR resolution, FastAPI argparse + ownership writes, `store.py.j2`).

| Path | Verdict |
|------|---------|
| `adapters/nuxt4/_staging-from-portal/` | Rejected overwrite. Kit ahead (docs/tests env, no bundle.yaml fallback). Deleted. |
| `adapters/fastapi/_staging-from-fast-api-base/` | Rejected overwrite. Kit ahead (argparse, multi-entity, safe writes). Deleted. |
| `adapters/nextjs/_trash-from-next_nest/` | Rejected overwrite. Kit ahead (same class of wiring as nuxt4). Deleted. |

Follow-up wired: FastAPI `api-gen -- openapi …` no longer gets auto-`write`
prefixed in `src/adapters/run-be.ts`.
