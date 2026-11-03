#!/usr/bin/env bash
set -euo pipefail
# Siglum 0.2.0 engine MUST be paired with its matching TeX Live 2026 runtime.
# This file is fetched in a free GitHub Actions runner, not on an iPhone.
cd "$(dirname "$0")/.."
mkdir -p runtime/wasm runtime/bundles
asset_url="https://github.com/SiglumProject/siglum/releases/download/v0.2.0/siglum-runtime-v0.2.0.tar.gz"
echo "Downloading matching Siglum TeX Live 2026 assets..."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl --fail --location --retry 3 --retry-delay 3 "$asset_url" --output "$tmp/runtime.tar.gz"
[ "$(wc -c < "$tmp/runtime.tar.gz")" -gt 1000000 ] || { echo 'Runtime archive unexpectedly small'; exit 1; }
tar -xzf "$tmp/runtime.tar.gz" -C "$tmp"
find "$tmp" -name 'runtime.json' -print | head -1
archive_root="$(find "$tmp" -name 'runtime.json' -printf '%h\n' | head -1)"
[ -n "$archive_root" ] || { echo 'No runtime.json found; incompatible release archive'; exit 1; }
[ -f "$archive_root/wasm/busytex.wasm" ] || { echo 'Missing matching busytex.wasm'; exit 1; }
cp "$archive_root"/wasm/* runtime/wasm/
# This release places the bundle files at the archive root; move them under
# /runtime/bundles/ to match Siglum's bundlesUrl API.
if [ -f "$archive_root/bundles/bundles.json" ]; then
  cp "$archive_root"/bundles/*.json runtime/bundles/
  cp "$archive_root"/bundles/*.data.gz runtime/bundles/
else
  cp "$archive_root"/*.json runtime/bundles/
  cp "$archive_root"/*.data.gz runtime/bundles/
fi
cp "$archive_root/runtime.json" runtime/runtime.json
[ -s runtime/bundles/bundles.json ] || { echo 'Missing bundle manifest'; exit 1; }
[ -s runtime/bundles/file-manifest.json ] || { echo 'Missing file manifest'; exit 1; }
[ -s runtime/wasm/busytex.js ] || { echo 'Missing JS runtime'; exit 1; }
echo "Runtime and bundles staged successfully."
