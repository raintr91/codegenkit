from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOLS_DIR))

from fast_gen.plan import build_file_plan, repo_root  # noqa: E402
from fast_gen.read_spec import read_spec_file  # noqa: E402
from fast_gen.registry import load_registry  # noqa: E402
from fast_gen.write_files import execute_generation, export_openapi  # noqa: E402

def registry_cmd() -> None:
  data = load_registry(repo_root())
  print(json.dumps(data, indent=2))


def dry_cmd(spec: str, force: bool = False) -> None:
  _run(spec, dry_run=True, force=force)


def write_cmd(spec: str, force: bool = False) -> None:
  _run(spec, dry_run=False, force=force)


def openapi_cmd(spec: str) -> None:
  spec_data, spec_path, feature_dir = read_spec_file(spec)
  sys.path.insert(0, str(repo_root() / "src"))
  out = export_openapi(feature_dir, spec_data)
  print(f"openapi: {out}")


def _run(spec: str, *, dry_run: bool, force: bool) -> None:
  spec_data, spec_path, feature_dir = read_spec_file(spec)
  plan = build_file_plan(spec_data, force=force)
  print(f"fast-gen: entities={len(plan['contexts'])} profile={plan['ctx']['profile']}")
  print(f"  spec: {spec_path}")
  if dry_run:
    print("  mode: dry-run")
  if force:
    print("  mode: force")

  for warning in plan["warnings"]:
    print(f"  warning: {warning}", file=sys.stderr)
  result = execute_generation(plan, feature_dir, spec_path, dry_run=dry_run)
  for item in result["decisions"]:
    status = item["status"]
    if not dry_run and status in ("would-write", "would-force"):
      status = "write" if status == "would-write" else "force"
    print(f"  {status}: {item['relativePath']}")
  if result["conflicts"]:
    print("Blocked: generated files have unmanaged or locally modified conflicts.", file=sys.stderr)
    print("Resolve the listed files or re-run with --force:", file=sys.stderr)
    for item in result["conflicts"]:
      print(f"  conflict: {item['relativePath']}", file=sys.stderr)
    raise SystemExit(2)
  if not dry_run:
    print(f"  manifest: {result['manifestPath']}")


def main() -> None:
  parser = argparse.ArgumentParser(description="FastAPI codegen")
  subparsers = parser.add_subparsers(dest="command", required=True)
  subparsers.add_parser("registry")
  for command in ("dry", "write", "openapi"):
    child = subparsers.add_parser(command)
    child.add_argument("--spec", required=True)
    if command != "openapi":
      child.add_argument("--force", action="store_true")
  args = parser.parse_args()
  if args.command == "registry":
    registry_cmd()
  elif args.command == "dry":
    dry_cmd(args.spec, args.force)
  elif args.command == "write":
    write_cmd(args.spec, args.force)
  else:
    openapi_cmd(args.spec)


if __name__ == "__main__":
  main()
