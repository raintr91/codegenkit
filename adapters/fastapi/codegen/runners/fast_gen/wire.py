from __future__ import annotations


def infer_wire_from_endpoints(endpoints: list[dict] | None) -> dict[str, bool]:
  endpoints = endpoints or []
  actions = {str(e.get("action", "")).lower() for e in endpoints}
  paths = " ".join(str(e.get("path", "")) for e in endpoints).lower()

  return {
    "search": "search" in actions or "list" in actions or "search" in paths or "list" in paths,
    "detail": "detail" in actions or "show" in actions,
    "create": "create" in actions or any(str(e.get("method", "")).upper() == "POST" for e in endpoints),
    "update": "update" in actions or "patch" in actions or any(
      str(e.get("method", "")).upper() in ("PUT", "PATCH") for e in endpoints
    ),
    "delete": "delete" in actions or any(
      str(e.get("method", "")).upper() == "DELETE" for e in endpoints
    ),
  }


def resolve_wire(spec: dict) -> dict[str, bool]:
  codegen = spec.get("codegen") or {}
  wire = codegen.get("wire")
  if isinstance(wire, dict):
    base = infer_wire_from_endpoints(spec.get("api", {}).get("endpoints"))
    return {**base, **{k: bool(v) for k, v in wire.items()}}
  return infer_wire_from_endpoints(spec.get("api", {}).get("endpoints"))
