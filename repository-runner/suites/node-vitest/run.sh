#!/bin/sh
set -eu
cd "$PROOFPAY_SOURCE"
exec node node_modules/vitest/vitest.mjs run
