#!/usr/bin/env bash
set -euo pipefail
kit_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec "${BL_BIN:-bl}" --cold js build dossier.share.client -p "$kit_dir" --out "$kit_dir/publication-client"
