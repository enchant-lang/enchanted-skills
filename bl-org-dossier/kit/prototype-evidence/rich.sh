#!/usr/bin/env bash
# rich.sh — P4 browser check on a COPY of a dossier (never a production file).
set -u
T=/home/othman/.claude/jobs/3eb592d8/tmp/re
KIT=/home/othman/projects/enchanted-skills-rich-edit/bl-org-dossier/kit
BL=/nix/store/zzblkn4gb0m03d9pbyqxyxrhdd7c0wx7-beam-lisp-sdk-selection/bin/bl
SRC=${1:-/home/othman/projects/clients/cocompany/final/rapport.bl.org}
mkdir -p $T/qa && cp "$SRC" $T/qa/doc.bl.org
export OWNER=qa-owner@example
PORT=24931 DOSSIER_OWNER=$OWNER DOSSIER_KIT_DIR=$KIT RICH_EDIT_DIR=$T/js-editor \
  $BL --cold -p $KIT serve $KIT/serve.bl -- $T/qa/doc.bl.org > $T/qa/server.log 2>&1 &
SP=$!
for i in $(seq 1 300); do curl -sf -o /dev/null http://127.0.0.1:24931/rev && break; sleep 1; done
PLAYWRIGHT_MODULE=/home/othman/projects/wire-android/ui/node_modules/playwright CHROMIUM=/home/othman/.nix-profile/bin/chromium \
  BASE=http://127.0.0.1:24931 DOC=$T/qa/doc.bl.org OUT=$T/shots node $T/rich.cjs
rc=$?
kill $SP 2>/dev/null; wait $SP 2>/dev/null
exit $rc
