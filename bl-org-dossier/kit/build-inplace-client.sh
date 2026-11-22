#!/usr/bin/env bash
# build-inplace-client.sh — compile the in-place editor for kit pages.
#
#   dossier.editor-client (this kit's reader and renderer) + Omega's
#   omega.live-doc.inplace and omega.projection → ES modules in
#   inplace-client/, which dossier.live serves to editors under
#   <prefix>/inplace/.
#
# Needs a Beam Lisp whose JS runtime has the portable leaves and twins
# (Enchant main, 2026-11-22 or later): BL_BIN, else `bl`. Omega's sources from
# OMEGA_SRC, else ~/projects/omega/src.
set -euo pipefail
kit_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
omega_src=${OMEGA_SRC:-$HOME/projects/omega/src}
out="$kit_dir/inplace-client"
[ -d "$out" ] && chmod -R u+w "$out"
exec "${BL_BIN:-bl}" --cold js build dossier.editor-client -p "$kit_dir" -p "$omega_src" --out "$out"
