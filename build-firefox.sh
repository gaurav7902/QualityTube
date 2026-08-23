#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_dir="$root_dir/extension/firefox"
output_dir="$root_dir/dist"
archive="$output_dir/qualitytube-firefox-1.0.0.zip"

mkdir -p "$output_dir"
rm -f "$archive"

(
    cd "$source_dir"
    zip -qr "$archive" .
)

printf 'Created %s\n' "$archive"
