from __future__ import annotations

import json
from pathlib import Path


def load_registry(repo_root: Path) -> dict:
  path = repo_root / "registries" / "codegen.registry.json"
  return json.loads(path.read_text(encoding="utf-8"))
