#!/usr/bin/env bash
set -euo pipefail

NVM_DIR="${IKIMETR_NVM_DIR:-/home/rahim/.nvm}"
PROJECT_DIR="${IKIMETR_PROJECT_DIR:-/mnt/c/Users/9305r/Desktop/ikimetr-realtor-collector}"
STATE_DIR="${IKIMETR_AUTOSTART_STATE_DIR:-/home/rahim/.local/state/ikimetr-realtor-collector}"
export NVM_DIR

. "$NVM_DIR/nvm.sh"
nvm use 24.19.0 >/dev/null
cd "$PROJECT_DIR"
mkdir -p "$STATE_DIR"

LOG_FILE="$STATE_DIR/collector.log"
LOCK_FILE="$STATE_DIR/collector.lock"
if [[ -f "$LOG_FILE" ]] && (( $(stat -c %s "$LOG_FILE") > 5000000 )); then
  for suffix in 4 3 2 1; do
    if [[ -f "$LOG_FILE.$suffix" ]]; then mv -f "$LOG_FILE.$suffix" "$LOG_FILE.$((suffix + 1))"; fi
  done
  mv -f "$LOG_FILE" "$LOG_FILE.1"
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then exit 75; fi
exec pnpm start:local >>"$LOG_FILE" 2>&1
