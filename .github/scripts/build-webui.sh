#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
npm install --no-package-lock --ignore-scripts
mkdir -p webroot/vendor
./node_modules/.bin/sass --quiet-deps --no-source-map --load-path=node_modules .github/mdc/style.scss webroot/vendor/mdc.css
./node_modules/.bin/esbuild webroot/app.js --bundle --format=iife --target=es2017 --outfile=webroot/vendor/mdc.js
if rg -q 'https?://(unpkg|cdn\.jsdelivr|fonts\.googleapis)' webroot/vendor; then
  echo "WebUI bundle contains a runtime CDN reference" >&2
  exit 1
fi
printf 'Built offline MDC Web 11.0.0 assets in webroot/vendor\n'
