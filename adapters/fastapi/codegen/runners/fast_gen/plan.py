from __future__ import annotations

import os
import keyword
import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from fast_gen.read_spec import to_kebab, to_pascal, to_snake
from fast_gen.registry import load_registry
from fast_gen.wire import resolve_wire


def render_template(template_name: str, ctx: dict, *, templates_dir: Path | None = None) -> str:
  base = templates_dir or (Path(__file__).resolve().parents[2] / "templates")
  env = Environment(
    loader=FileSystemLoader(str(base)),
    autoescape=select_autoescape(enabled_extensions=()),
    trim_blocks=True,
    lstrip_blocks=True,
  )
  return env.get_template(template_name).render(**ctx)


def repo_root() -> Path:
  target = os.environ.get("CODEGENKIT_ROOT")
  if not target:
    raise RuntimeError("CODEGENKIT_ROOT is required for the FastAPI adapter")
  return Path(target).resolve()


def python_identifier(value: str, label: str) -> str:
  identifier = to_snake(value)
  if not identifier.isidentifier() or keyword.iskeyword(identifier):
    raise ValueError(f"Invalid {label} for Python identifier: {value!r}")
  return identifier


def python_type(field: dict) -> str:
  raw = str(field.get("type") or field.get("dataType") or "string").lower()
  return {
    "string": "str",
    "str": "str",
    "integer": "int",
    "int": "int",
    "number": "float",
    "float": "float",
    "boolean": "bool",
    "bool": "bool",
    "array": "list",
    "list": "list",
    "object": "dict",
    "dict": "dict",
  }.get(raw, "str")


def resolve_codegen_context(spec: dict) -> dict:
  codegen = spec.get("codegen") or {}
  primary_module = (spec.get("modules") or [{}])[0]
  flat_entity = (spec.get("entities") or [{}])[0]
  primary_entity = (primary_module.get("entities") or [flat_entity])[0]

  module = codegen.get("module") or primary_module.get("name") or "App"
  entity = codegen.get("entity") or primary_entity.get("name") or "Entity"
  profile = codegen.get("profile") or "crud-standard"

  module_kebab = to_kebab(module)
  module_package = python_identifier(module, "module")
  entity_kebab = to_kebab(entity)
  entity_snake = python_identifier(entity, "entity")
  entity_pascal = to_pascal(entity)
  module_pascal = to_pascal(module)
  wire = resolve_wire(spec)

  endpoints = spec.get("api", {}).get("endpoints") or []
  search_ep = next(
    (e for e in endpoints if e.get("action") in ("search", "list")),
    endpoints[0] if endpoints else None,
  )
  route_prefix = "/"
  if search_ep and search_ep.get("path"):
    route_prefix = search_ep["path"]
  elif endpoints and endpoints[0].get("path"):
    route_prefix = endpoints[0]["path"]
  route_prefix = re.sub(r"/\{[^/]+\}$", "", route_prefix).rstrip("/") or f"/{entity_kebab}s"

  entity_fields = primary_entity.get("fields") or []
  field_defs = []
  for field in entity_fields:
    raw_name = field.get("name") or field.get("key")
    if not raw_name:
      continue
    name = python_identifier(str(raw_name), "field")
    required = bool(field.get("required")) and name != "id"
    field_defs.append({
      "name": name,
      "type": python_type(field),
      "required": required,
    })
  if not field_defs:
    field_defs = [
      {"name": "id", "type": "int", "required": False},
      {"name": "name", "type": "str", "required": False},
    ]

  return {
    "module": module,
    "entity": entity,
    "profile": profile,
    "module_kebab": module_kebab,
    "module_package": module_package,
    "module_pascal": module_pascal,
    "entity_kebab": entity_kebab,
    "entity_snake": entity_snake,
    "entity_pascal": entity_pascal,
    "wire": wire,
    "route_prefix": route_prefix,
    "field_names": [field["name"] for field in field_defs],
    "field_defs": field_defs,
    "endpoints": endpoints,
    "spec": spec,
  }


def build_file_plan(spec: dict, *, force: bool = False) -> dict:
  root = repo_root()
  ctx = resolve_codegen_context(spec)
  registry = load_registry(root)
  base = f"src/app/modules/{ctx['module_package']}/{ctx['entity_snake']}"
  files: list[dict] = []
  skipped: list[dict] = []

  def add(file_id: str, relative_path: str, template: str, layer: str) -> None:
    abs_path = root / relative_path
    if abs_path.exists() and not force:
      skipped.append({"id": file_id, "relativePath": relative_path, "reason": "exists"})
      return
    files.append({"id": file_id, "relativePath": relative_path, "template": template, "layer": layer})

  add("router", f"{base}/router.py", "router.py.j2", "router")
  add("schemas_request", f"{base}/schemas/request.py", "schemas_request.py.j2", "schemas")
  add("schemas_response", f"{base}/schemas/response.py", "schemas_response.py.j2", "schemas")
  add("presenter", f"{base}/presenters/{ctx['entity_snake']}_presenter.py", "presenter.py.j2", "presenter")
  if any(ctx["wire"].get(action) for action in ("search", "create", "update", "delete")):
    add("store", f"{base}/services/store.py", "store.py.j2", "service")

  if ctx["wire"].get("search"):
    add("service_search", f"{base}/services/search_service.py", "service_search.py.j2", "service")
  if ctx["wire"].get("create"):
    add("service_create", f"{base}/services/create_service.py", "service_create.py.j2", "service")
  if ctx["wire"].get("update"):
    add("service_update", f"{base}/services/update_service.py", "service_update.py.j2", "service")
  if ctx["wire"].get("delete"):
    add("service_delete", f"{base}/services/delete_service.py", "service_delete.py.j2", "service")

  add("test_router", f"tests/test_{ctx['entity_snake']}_router.py", "test_router.py.j2", "test")

  return {"ctx": ctx, "files": files, "skipped": skipped, "registry": registry}
