from __future__ import annotations

import json
import sys
from pathlib import Path

import typer
import yaml

TOOLS_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOLS_DIR))

from fast_gen.plan import build_file_plan, repo_root  # noqa: E402
from fast_gen.read_spec import read_spec_file  # noqa: E402
from fast_gen.registry import load_registry  # noqa: E402
from fast_gen.write_files import export_openapi, write_manifest, write_outputs  # noqa: E402

app = typer.Typer(help="FastAPI codegen — Jinja2 + Typer")


@app.command("registry")
def registry_cmd() -> None:
  data = load_registry(repo_root())
  typer.echo(json.dumps(data, indent=2))


@app.command("dry")
def dry_cmd(
  spec: str = typer.Option(..., "--spec", help="Path to backend/01-backend-spec.yaml"),
  force: bool = typer.Option(False, "--force"),
) -> None:
  _run(spec, dry_run=True, force=force)


@app.command("write")
def write_cmd(
  spec: str = typer.Option(..., "--spec", help="Path to backend/01-backend-spec.yaml"),
  force: bool = typer.Option(False, "--force"),
) -> None:
  _run(spec, dry_run=False, force=force)


@app.command("openapi")
def openapi_cmd(
  spec: str = typer.Option(..., "--spec", help="Path to backend spec (for feature dir)"),
) -> None:
  spec_data, spec_path, feature_dir = read_spec_file(spec)
  sys.path.insert(0, str(repo_root() / "src"))
  out = export_openapi(feature_dir, spec_data)
  typer.echo(f"openapi: {out}")


def _run(spec: str, *, dry_run: bool, force: bool) -> None:
  spec_data, spec_path, feature_dir = read_spec_file(spec)
  plan = build_file_plan(spec_data, force=force)
  ctx = plan["ctx"]
  typer.echo(f"fast-gen: module={ctx['module']} entity={ctx['entity']} profile={ctx['profile']}")
  typer.echo(f"  spec: {spec_path}")
  if dry_run:
    typer.echo("  mode: dry-run")
  if force:
    typer.echo("  mode: force")

  written, skipped = write_outputs(plan, dry_run=dry_run)
  meta = write_manifest(feature_dir, plan, spec_path, dry_run=dry_run, written=written)

  for path in written:
    typer.echo(f"  {'[dry]' if dry_run else 'write'}: {path}")
  for item in skipped:
    typer.echo(f"  skip: {item['relativePath']} ({item['reason']})")

  if not dry_run:
    typer.echo(f"  manifest: {meta['manifestPath']}")


if __name__ == "__main__":
  app()
