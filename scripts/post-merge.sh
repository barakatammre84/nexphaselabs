#!/usr/bin/env bash
set -euo pipefail

# Restore the exact dependency tree after task merges. Database migrations and
# external-service setup are intentionally excluded so this remains safe for
# the live production project.
npm ci --no-audit --no-fund