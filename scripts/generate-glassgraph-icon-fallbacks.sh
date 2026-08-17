#!/bin/sh
# Renders standard icon fallbacks directly from the existing GlassGraph mark.
# This is intentionally not part of the Vercel build because sips is macOS-only.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
mark="$root/assets/glassgraph-mark.svg"

sips -s format png -z 180 180 "$mark" --out "$root/assets/apple-touch-icon.png"
sips -s format ico -z 64 64 "$mark" --out "$root/assets/favicon.ico"
