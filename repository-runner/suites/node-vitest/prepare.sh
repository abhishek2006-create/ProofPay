#!/bin/sh
set -eu
cp "$PROOFPAY_SOURCE/package.json" /work/package.json
cp "$PROOFPAY_SOURCE/package-lock.json" /work/package-lock.json
cd /work
npm ci --ignore-scripts --omit=optional --cache /tmp/npm-cache
mv node_modules /dependencies/node_modules
