from __future__ import annotations

import sys
from pathlib import Path

import typer

TOOLS_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOLS_DIR))

from fast_gen.plan import build_file_plan, render_template, repo_root  # noqa: E402
from fast_gen.read_spec import read_spec_file  # noqa: E402

UNIT_TEMPLATES = Path(__file__).resolve().parents[2] / "templates"

app = typer.Typer(help="FastAPI unit test codegen")


@app.command("dry")
def dry_cmd(spec: str = typer.Option(..., "--spec"), force: bool = typer.Option(False, "--force")) -> None:
  _run(spec, dry_run=True, force=force)


@app.command("write")
def write_cmd(spec: str = typer.Option(..., "--spec"), force: bool = typer.Option(False, "--force")) -> None:
  _run(spec, dry_run=False, force=force)


def _run(spec: str, *, dry_run: bool, force: bool) -> None:
  spec_data, spec_path, feature_dir = read_spec_file(spec)
  plan = build_file_plan(spec_data, force=force)
  ctx = plan["ctx"]
  rel = f"tests/unit/test_{ctx['entity_snake']}_service.py"
  root = repo_root()
  abs_path = root / rel

  if abs_path.exists() and not force:
    typer.echo(f"skip: {rel} (exists)")
    return

  content = render_template("test_service.py.j2", ctx, templates_dir=UNIT_TEMPLATES)
  typer.echo(f"fast-unit-gen: {ctx['entity_pascal']}")
  if dry_run:
    typer.echo(f"  [dry] {rel}")
    return

  abs_path.parent.mkdir(parents=True, exist_ok=True)
  abs_path.write_text(content, encoding="utf-8")
  typer.echo(f"  write: {rel}")

  manifest_dir = feature_dir / "generated"
  manifest_dir.mkdir(parents=True, exist_ok=True)
  (manifest_dir / "unit.manifest.json").write_text(
    f'{{"spec": "{spec_path}", "test": "{rel}"}}\n',
    encoding="utf-8",
  )


if __name__ == "__main__":
  app()
