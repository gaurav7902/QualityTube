#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_dir="$root_dir/extension/firefox"
manifest="$source_dir/manifest.json"
archive="$root_dir/qualitytube-firefox-$(jq -r '.version' "$manifest").zip"

rm -f "$archive"

(
    cd "$source_dir"
    zip -qr "$archive" .
)

printf 'Created %s\n' "$archive"
