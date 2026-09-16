#!/bin/bash
# Runs the full verification suite and leaves a one-line verdict in
# .git/NX_VERIFY. Exists because the desktop bridge times out on commands
# that take longer than it is willing to wait, so this is launched detached
# and its result polled.
cd "$(dirname "$0")/.." || exit 1
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
OUT=.git/NX_VERIFY
: > "$OUT"
npx tsc --noEmit > /tmp/nx_tsc.log 2>&1; echo "TSC=$?" >> "$OUT"
npm run lint > /tmp/nx_lint.log 2>&1;  echo "LINT=$?" >> "$OUT"
npx vitest run > /tmp/nx_test.log 2>&1; echo "TEST=$?" >> "$OUT"
grep -E '^ *Tests ' /tmp/nx_test.log | tail -1 | tr -d '\033' >> "$OUT"
npm run build > /tmp/nx_build.log 2>&1; echo "BUILD=$?" >> "$OUT"
echo "FINISHED" >> "$OUT"
