#!/usr/bin/env bash
set -euo pipefail
REPO="${CODEGENKIT_REPO:-raintr91/codegenkit}"
INSTALL_DIR="${CODEGENKIT_INSTALL_DIR:-$HOME/.codegenkit}"
BIN_DIR="${CODEGENKIT_BIN_DIR:-$HOME/.local/bin}"
REF="${CODEGENKIT_REF:-}"
if [ -z "$REF" ]; then
  REF=$(git ls-remote --tags --sort="v:refname" "https://github.com/$REPO.git" 2>/dev/null | grep -v '\^{}' | awk -F/ '{print $3}' | tail -n1)
  if [ -z "$REF" ]; then
    REF="main"
  fi
fi
if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$BIN_DIR/codegenkit" "$BIN_DIR/codegenkit-mcp"
  rm -rf "$INSTALL_DIR"
  echo "codegenkit uninstalled"
  exit 0
fi
command -v node >/dev/null
command -v git >/dev/null
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
git clone --depth 1 --branch "$REF" "https://github.com/$REPO.git" "$tmpdir/src"
rm -rf "$INSTALL_DIR"
mkdir -p "$(dirname "$INSTALL_DIR")"
mv "$tmpdir/src" "$INSTALL_DIR"
cd "$INSTALL_DIR"
if command -v pnpm >/dev/null; then
  pnpm install --frozen-lockfile
  pnpm build
else
  npm ci
  npm run build
fi
mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/bin/codegenkit.mjs" "$BIN_DIR/codegenkit"
ln -sf "$INSTALL_DIR/bin/codegenkit-mcp.mjs" "$BIN_DIR/codegenkit-mcp"
chmod +x "$INSTALL_DIR/bin/"*.mjs
echo "Installed Codegenkit. Next:"
echo "  FE: codegenkit init --type=fe --adapter=nuxt4 --yes"
echo "  FE .NET 8: codegenkit init --type=fe --adapter=dotnet-line --yes"
echo "  BE: codegenkit init --type=be --adapter=fastapi --yes"
echo "  BE .NET 8: codegenkit init --type=be --adapter=dotnet-integration --yes"
echo "  Fullstack: codegenkit init --type=fullstack --fe-adapter=nuxt4 --be-adapter=fastapi --yes"
