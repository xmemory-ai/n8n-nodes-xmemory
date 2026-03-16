#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CUSTOM_DIR="${CUSTOM_DIR:-${HOME}/.n8n/custom}"

echo "[1/5] Building connector package"
cd "$SCRIPT_DIR"
if [[ ! -d node_modules ]]; then
  echo "Installing build dependencies (first run)"
  npm ci --no-audit --no-fund --loglevel=error
else
  echo "Build dependencies already present, skipping install"
fi
npm run build

echo "[2/5] Packing connector"
PKG_TGZ="$(npm pack | tail -n 1)"
PKG_PATH="$SCRIPT_DIR/$PKG_TGZ"

if [[ ! -f "$PKG_PATH" ]]; then
  echo "ERROR: package tarball not found at $PKG_PATH" >&2
  exit 1
fi

echo "[3/5] Preparing n8n custom extensions directory"
mkdir -p "$CUSTOM_DIR"

CUSTOM_TGZ_PATH="$CUSTOM_DIR/$PKG_TGZ"
cp -f "$PKG_PATH" "$CUSTOM_TGZ_PATH"

cd "$CUSTOM_DIR"

if [[ ! -f package.json ]]; then
  cat > package.json <<'EOF'
{
  "name": "n8n-custom-extensions",
  "private": true,
  "version": "1.0.0",
  "type": "commonjs"
}
EOF
fi

# Keep metadata minimal and stable even if package.json already existed.
# This preserves dependencies while removing npm init scaffold fields.
npm pkg set name="n8n-custom-extensions" type="commonjs" >/dev/null
npm pkg set private=true --json >/dev/null
npm pkg delete scripts description main keywords author license >/dev/null 2>&1 || true

echo "[4/5] Installing connector tarball into $CUSTOM_DIR"
npm install "$CUSTOM_TGZ_PATH"

echo "[5/5] Verifying install"
TARGET="$CUSTOM_DIR/node_modules/n8n-nodes-xmemory"
if [[ -L "$TARGET" ]]; then
  echo "WARNING: $TARGET is still a symlink" >&2
  ls -la "$TARGET"
  exit 2
fi

if [[ ! -d "$TARGET" ]]; then
  echo "ERROR: expected directory not found: $TARGET" >&2
  exit 1
fi

ls -la "$TARGET"

echo
cat <<'EOF'
Install completed.

To use in local n8n:
  export N8N_CUSTOM_EXTENSIONS="$HOME/.n8n/custom/node_modules"
  n8n start

To use in Docker n8n, mount:
  ${HOME}/.n8n/custom:/home/node/.n8n/custom
and set:
  N8N_CUSTOM_EXTENSIONS=/home/node/.n8n/custom/node_modules
EOF
