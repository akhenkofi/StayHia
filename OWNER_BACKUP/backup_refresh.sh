#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNAP="$ROOT/OWNER_BACKUP/snapshots"
mkdir -p "$SNAP"

[ -f "$ROOT/api/data/runtime-store.json" ] && cp "$ROOT/api/data/runtime-store.json" "$SNAP/runtime-store.json" || true
rm -rf "$SNAP/assets"
[ -d "$ROOT/assets" ] && cp -R "$ROOT/assets" "$SNAP/assets" || true

echo "StayHia OWNER_BACKUP refreshed."
