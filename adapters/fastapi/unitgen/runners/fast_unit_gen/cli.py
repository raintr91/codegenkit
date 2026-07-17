from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOLS_DIR))

from fast_gen.plan import build_file_plan, render_template, repo_root  # noqa: E402
from fast_gen.read_spec import read_spec_file  # noqa: E402
from fast_gen.write_files import _package_version, _reject_symlinks, _safe_target  # noqa: E402

UNIT_TEMPLATES = Path(__file__).resolve().parents[2] / "templates"

def dry_cmd(spec: str, force: bool = False) -> None:
  _run(spec, dry_run=True, force=force)


def write_cmd(spec: str, force: bool = False) -> None:
  _run(spec, dry_run=False, force=force)


def _run(spec: str, *, dry_run: bool, force: bool) -> None:
  spec_data, spec_path, feature_dir = read_spec_file(spec)
  plan = build_file_plan(spec_data, force=force)
  root = repo_root()
  manifest_path = feature_dir / "generated" / "unit.manifest.json"
  _reject_symlinks(manifest_path)
  prior: dict = {}
  if manifest_path.exists():
    try:
      loaded = json.loads(manifest_path.read_text(encoding="utf-8"))
      if loaded.get("schemaVersion") == 2:
        prior = loaded
    except (OSError, json.JSONDecodeError):
      pass

  outputs: list[dict] = []
  entity_counts = {
    ctx["entity_snake"]: sum(
      other["entity_snake"] == ctx["entity_snake"] for other in plan["contexts"]
    )
    for ctx in plan["contexts"]
  }
  for ctx in plan["contexts"]:
    stem = ctx["entity_snake"]
    if entity_counts[stem] > 1:
      stem = f"{ctx['module_package']}_{stem}"
    rel = f"tests/unit/test_{stem}_service.py"
    content = render_template("test_service.py.j2", ctx, templates_dir=UNIT_TEMPLATES)
    outputs.append({
      "relativePath": rel,
      "target": _safe_target(root, rel),
      "content": content,
      "sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
      "template": "test_service.py.j2",
      "layer": "service-test",
      "entity": ctx["entity"],
      "module": ctx["module"],
    })
  paths = [item["relativePath"] for item in outputs]
  duplicates = sorted({item for item in paths if paths.count(item) > 1})
  if duplicates:
    raise ValueError(f"Duplicate generated unit output paths: {', '.join(duplicates)}")

  prior_files = prior.get("files") or {}
  for item in outputs:
    target = item["target"]
    if not target.exists():
      item["status"] = "would-write"
      continue
    existing_hash = hashlib.sha256(target.read_bytes()).hexdigest()
    if existing_hash == item["sha256"]:
      item["status"] = "unchanged"
    elif prior_files.get(item["relativePath"], {}).get("sha256") == existing_hash:
      item["status"] = "would-write"
    elif force:
      item["status"] = "would-force"
    else:
      item["status"] = "conflict"

  print(f"fast-unit-gen: entities={len(plan['contexts'])}")
  for item in outputs:
    status = item["status"]
    if not dry_run and status in ("would-write", "would-force"):
      status = "write" if status == "would-write" else "force"
    print(f"  {status}: {item['relativePath']}")
  conflicts = [item for item in outputs if item["status"] == "conflict"]
  if conflicts:
    print("Blocked: unit files have unmanaged or locally modified conflicts; use --force to overwrite.", file=sys.stderr)
    raise SystemExit(2)
  if dry_run:
    return

  for item in outputs:
    if item["status"] != "unchanged":
      item["target"].parent.mkdir(parents=True, exist_ok=True)
      item["target"].write_text(item["content"], encoding="utf-8")
  manifest = {
    "schemaVersion": 2,
    "packageVersion": _package_version(),
    "generator": "fastapi-unitgen",
    "spec": str(spec_path),
    "entities": [
      {"module": ctx["module"], "entity": ctx["entity"]}
      for ctx in plan["contexts"]
    ],
    "files": {
      item["relativePath"]: {
        "sha256": item["sha256"],
        "template": item["template"],
        "layer": item["layer"],
        "entity": item["entity"],
        "module": item["module"],
      }
      for item in outputs
    },
  }
  manifest_path.parent.mkdir(parents=True, exist_ok=True)
  manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
  print(f"  manifest: {manifest_path}")


def main() -> None:
  parser = argparse.ArgumentParser(description="FastAPI unit test codegen")
  subparsers = parser.add_subparsers(dest="command", required=True)
  for command in ("dry", "write"):
    child = subparsers.add_parser(command)
    child.add_argument("--spec", required=True)
    child.add_argument("--force", action="store_true")
  args = parser.parse_args()
  _run(args.spec, dry_run=args.command == "dry", force=args.force)


if __name__ == "__main__":
  main()
