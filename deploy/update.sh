#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/game-catalog}"

cd "$APP_DIR"
exec npm run --silent catalog:sync
