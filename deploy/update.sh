#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/game-catalog}"
WEB_ROOT="${WEB_ROOT:-/var/www/game-catalog}"

cd "$APP_DIR"

if [ "${CATALOG_ONLY:-false}" != "true" ]; then
  git pull --ff-only
  npm ci
fi

npm run build
rsync -a --delete dist/ "$WEB_ROOT/"
