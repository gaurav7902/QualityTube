#!/usr/bin/env bash
set -euo pipefail

for command_name in jq zip; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        printf 'Required command not found: %s\n' "$command_name" >&2
        exit 1
    fi
done

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_dir="$root_dir/extension/chromium-based"
manifest="$source_dir/manifest.json"
archive="$root_dir/qualitytube-chrome-$(jq -r '.version' "$manifest").zip"

rm -f "$archive"

(
    cd "$source_dir"
    zip -qr "$archive" .
)

printf 'Created %s\n' "$archive"
