#!/usr/bin/env bash
# Copy provider keys from a source env file into .env.local.
# Usage: bash scripts/setup-env.sh /path/to/source.env [.env.local]
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/setup-env.sh /path/to/source.env [.env.local]" >&2
  exit 1
fi

SRC="$1"
DEST="${2:-$(dirname "$0")/../.env.local}"

if [[ ! -f "$SRC" ]]; then
  echo "Source .env not found: $SRC" >&2
  exit 1
fi

cp "$SRC" "$DEST"

# Normalize OPENAPI_KEY → OPENAI_API_KEY when only the former is set
if grep -q '^OPENAPI_KEY=' "$DEST" && ! grep -q '^OPENAI_API_KEY=' "$DEST"; then
  openapi_line=$(grep '^OPENAPI_KEY=' "$DEST")
  echo "${openapi_line/OPENAPI_KEY=/OPENAI_API_KEY=}" >> "$DEST"
fi

echo "Copied $SRC → $DEST"
