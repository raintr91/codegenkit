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


def _matches_endpoint(endpoint: dict, module: str, entity: str) -> bool:
  module_tokens = {module.lower(), to_kebab(module), to_snake(module)}
  entity_tokens = {entity.lower(), to_kebab(entity), to_snake(entity), to_pascal(entity).lower()}
  explicit_module = endpoint.get("module") or endpoint.get("moduleName")
  explicit_entity = endpoint.get("entity") or endpoint.get("entityName")
  if explicit_module is not None:
    if str(explicit_module).lower() not in module_tokens:
      return False
    if explicit_entity is not None:
      return str(explicit_entity).lower() in entity_tokens
  if explicit_entity is not None:
    return str(explicit_entity).lower() in entity_tokens
  values = [
    str(endpoint.get(key) or "")
    for key in ("id", "name", "path", "request", "requestName", "response", "responseName")
  ]
  entity_snake = to_snake(entity)
  entity_kebab = to_kebab(entity)
  for value in values:
    normalized = to_snake(value)
    words = set(re.split(r"[^a-z0-9]+", normalized))
    if entity_snake in words:
      return True
    path_words = set(re.split(r"[^a-z0-9-]+", value.lower()))
    if entity_kebab in path_words or f"{entity_kebab}s" in path_words:
      return True
    if entity_kebab.endswith("y") and f"{entity_kebab[:-1]}ies" in path_words:
      return True
  return False


def _plural_route(entity_kebab: str) -> str:
  if entity_kebab.endswith("y") and not entity_kebab.endswith(("ay", "ey", "iy", "oy", "uy")):
    return f"{entity_kebab[:-1]}ies"
  if entity_kebab.endswith(("s", "x", "z", "ch", "sh")):
    return f"{entity_kebab}es"
  return f"{entity_kebab}s"


def _selector_key(value: object) -> str:
  return to_snake(str(value))


def _entity_sources(spec: dict) -> list[tuple[dict, dict]]:
  codegen = spec.get("codegen") or {}
  discovered: list[tuple[dict, dict]] = []
  for module in spec.get("modules") or []:
    if not isinstance(module, dict):
      continue
    for entity in module.get("entities") or []:
      if isinstance(entity, dict):
        discovered.append((module, entity))
  if not discovered:
    flat = [entity for entity in (spec.get("entities") or []) if isinstance(entity, dict)]
    default_module = {"name": codegen.get("module") or "App"}
    discovered = [(default_module, entity) for entity in flat]
  if not discovered:
    return [({"name": codegen.get("module") or "App"}, {"name": codegen.get("entity") or "Entity"})]

  module_selector = codegen.get("module")
  entity_selector = codegen.get("entity")
  selected = discovered
  if module_selector is not None:
    wanted = _selector_key(module_selector)
    selected = [(m, e) for m, e in selected if _selector_key(m.get("name") or "") == wanted]
  if entity_selector is not None:
    wanted = _selector_key(entity_selector)
    selected = [(m, e) for m, e in selected if _selector_key(e.get("name") or "") == wanted]
  if not selected:
    available = ", ".join(
      f"{module.get('name')}.{entity.get('name')}" for module, entity in discovered
    )
    requested = ".".join(
      str(part) for part in (module_selector, entity_selector) if part is not None
    )
    raise ValueError(
      f"codegen selector {requested!r} matches no module/entity; available: {available}"
    )
  return selected


def resolve_codegen_context(
  spec: dict,
  module_data: dict | None = None,
  entity_data: dict | None = None,
  *,
  multi_entity: bool = False,
) -> dict:
  codegen = spec.get("codegen") or {}
  primary_module = module_data or {"name": codegen.get("module") or "App"}
  primary_entity = entity_data or {"name": codegen.get("entity") or "Entity"}

  module = primary_module.get("name") or codegen.get("module") or "App"
  entity = primary_entity.get("name") or codegen.get("entity") or "Entity"
  profile = codegen.get("profile") or "crud-standard"

  module_kebab = to_kebab(module)
  module_package = python_identifier(module, "module")
  entity_kebab = to_kebab(entity)
  entity_snake = python_identifier(entity, "entity")
  entity_pascal = to_pascal(entity)
  module_pascal = to_pascal(module)
  all_endpoints = spec.get("api", {}).get("endpoints") or []
  warnings: list[str] = []
  if multi_entity:
    endpoints = [e for e in all_endpoints if isinstance(e, dict) and _matches_endpoint(e, module, entity)]
    if not endpoints:
      warnings.append(
        f"No unambiguous endpoints for {module}.{entity}; using generated CRUD defaults"
      )
      default_path = f"/{_plural_route(entity_kebab)}"
      endpoints = [
        {"action": "list", "method": "GET", "path": default_path},
        {"action": "create", "method": "POST", "path": default_path},
        {"action": "update", "method": "PATCH", "path": f"{default_path}/{{id}}"},
        {"action": "delete", "method": "DELETE", "path": f"{default_path}/{{id}}"},
      ]
  else:
    endpoints = [e for e in all_endpoints if isinstance(e, dict)]
  entity_spec = {**spec, "api": {**(spec.get("api") or {}), "endpoints": endpoints}}
  wire = resolve_wire(entity_spec)
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
    "warnings": warnings,
    "spec": spec,
  }


def build_file_plan(spec: dict, *, force: bool = False) -> dict:
  root = repo_root()
  registry = load_registry(root)
  files: list[dict] = []
  contexts: list[dict] = []
  sources = _entity_sources(spec)
  multi_entity = len(sources) > 1

  def add(ctx: dict, file_id: str, relative_path: str, template: str, layer: str) -> None:
    files.append({
      "id": file_id,
      "relativePath": relative_path,
      "template": template,
      "layer": layer,
      "entity": ctx["entity"],
      "module": ctx["module"],
      "ctx": ctx,
    })

  for module_data, entity_data in sources:
    ctx = resolve_codegen_context(
      spec, module_data, entity_data, multi_entity=multi_entity
    )
    contexts.append(ctx)
    base = f"src/app/modules/{ctx['module_package']}/{ctx['entity_snake']}"
    add(ctx, "router", f"{base}/router.py", "router.py.j2", "router")
    add(ctx, "schemas_request", f"{base}/schemas/request.py", "schemas_request.py.j2", "schemas")
    add(ctx, "schemas_response", f"{base}/schemas/response.py", "schemas_response.py.j2", "schemas")
    add(ctx, "presenter", f"{base}/presenters/{ctx['entity_snake']}_presenter.py", "presenter.py.j2", "presenter")
    if any(ctx["wire"].get(action) for action in ("search", "create", "update", "delete")):
      add(ctx, "store", f"{base}/services/store.py", "store.py.j2", "service")
    for action in ("search", "create", "update", "delete"):
      if ctx["wire"].get(action):
        add(ctx, f"service_{action}", f"{base}/services/{action}_service.py", f"service_{action}.py.j2", "service")
    add(ctx, "test_router", f"tests/test_{ctx['entity_snake']}_router.py", "test_router.py.j2", "test")

  paths = [file["relativePath"] for file in files]
  duplicates = sorted({item for item in paths if paths.count(item) > 1})
  for file in files:
    if file["relativePath"] in duplicates and file["layer"] == "test":
      ctx = file["ctx"]
      file["relativePath"] = (
        f"tests/test_{ctx['module_package']}_{ctx['entity_snake']}_router.py"
      )
  paths = [file["relativePath"] for file in files]
  duplicates = sorted({item for item in paths if paths.count(item) > 1})
  if duplicates:
    raise ValueError(f"Duplicate generated output paths: {', '.join(duplicates)}")
  return {
    "ctx": contexts[0],
    "contexts": contexts,
    "files": files,
    "registry": registry,
    "force": force,
    "root": root,
    "warnings": [warning for ctx in contexts for warning in ctx["warnings"]],
  }
