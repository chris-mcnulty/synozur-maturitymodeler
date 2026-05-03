#!/usr/bin/env bash
# Convenience wrapper around `npm run test:mobile-layouts`.
#
# The canonical entry-point is the npm script:
#
#   npm run test:mobile-layouts
#
# This shell wrapper exists for callers who want extra Playwright flags,
# e.g. `bash scripts/test-mobile-layouts.sh --headed --debug`. Honors
# E2E_BASE_URL / E2E_NO_SERVER like the rest of the e2e suite (see
# tests/README.md).

set -euo pipefail

exec npm run test:mobile-layouts -- "$@"
