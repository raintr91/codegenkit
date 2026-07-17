from __future__ import annotations

import re
from pathlib import Path

import yaml


def to_kebab(value: str) -> str:
  s = re.sub(r"([a-z])([A-Z])", r"\1-\2", str(value))
  return re.sub(r"[\s_]+", "-", s).lower()


def to_snake(value: str) -> str:
  s = re.sub(r"([a-z])([A-Z])", r"\1_\2", str(value))
  return re.sub(r"[\s\-]+", "_", s).lower()


def to_pascal(value: str) -> str:
  parts = re.split(r"[-_\s]+", str(value))
  return "".join(p[:1].upper() + p[1:] for p in parts if p)


def read_spec_file(spec_path: str | Path) -> tuple[dict, Path, Path]:
  abs_path = Path(spec_path).resolve()
  raw = abs_path.read_text(encoding="utf-8")
  spec = yaml.safe_load(raw)
  if not isinstance(spec, dict):
    raise ValueError(f"Invalid spec YAML: {abs_path}")
  if "backend" in abs_path.parts:
    feature_dir = abs_path.parent.parent
  else:
    feature_dir = abs_path.parent
  return spec, abs_path, feature_dir
