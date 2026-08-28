#!/bin/sh
set -eu

: "${MONGO_DB_NAME:?MONGO_DB_NAME required}"
: "${MONGO_APP_USER:?MONGO_APP_USER required}"
: "${MONGO_APP_PASSWORD:?MONGO_APP_PASSWORD required}"
: "${BACKUP_HOUR:=2}"
: "${BACKUP_RETENTION_DAYS:=30}"

BACKUP_DIR=/backups
URI="mongodb://${MONGO_APP_USER}:${MONGO_APP_PASSWORD}@mongo:27017/${MONGO_DB_NAME}?authSource=${MONGO_DB_NAME}"

log() { echo "[backup $(date '+%Y-%m-%d %H:%M:%S %Z')] $*"; }

run_backup() {
  ts=$(date +%Y%m%d-%H%M%S)
  out="${BACKUP_DIR}/grandios-${ts}.archive.gz"
  tmp="${out}.partial"

  log "starting dump -> $(basename "$out")"
  if mongodump --uri="$URI" --archive="$tmp" --gzip --quiet; then
    mv "$tmp" "$out"
    log "done: $(basename "$out") ($(du -h "$out" | cut -f1))"
  else
    rm -f "$tmp"
    log "ERROR: dump failed"
    return 1
  fi

  deleted=$(find "$BACKUP_DIR" -maxdepth 1 -name 'grandios-*.archive.gz' \
    -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete | wc -l)
  [ "$deleted" -gt 0 ] && log "pruned ${deleted} archive(s) older than ${BACKUP_RETENTION_DAYS}d"
  return 0
}

# Resolve "<day> <BACKUP_HOUR>:00" to an epoch. On the EU spring-forward night
# the clocks jump 02:00 -> 03:00, so the configured hour may not exist that day
# and `date` errors; fall back to the next hour that does.
resolve_run() {
  day=$1
  off=0
  while [ "$off" -le 2 ]; do
    h=$((BACKUP_HOUR + off))
    if [ "$h" -le 23 ] && t=$(date -d "${day} ${h}:00" +%s 2>/dev/null); then
      printf '%s\n' "$t"
      return 0
    fi
    off=$((off + 1))
  done
  return 1
}

# Allow an immediate one-off run: `docker compose run --rm mongo-backup now`
if [ "${1:-}" = "now" ]; then
  run_backup
  exit $?
fi

log "sidecar started; daily backup at ${BACKUP_HOUR}:00 ${TZ:-UTC}, retention ${BACKUP_RETENTION_DAYS}d"

while true; do
  now=$(date +%s)
  next=$(resolve_run today) || next=""
  if [ -z "$next" ] || [ "$next" -le "$now" ]; then
    next=$(resolve_run tomorrow) || next=""
  fi

  if [ -z "$next" ]; then
    log "WARN: could not resolve next run time; retrying in 1h"
    sleep 3600
    continue
  fi

  log "next run: $(date -d "@${next}" '+%Y-%m-%d %H:%M:%S %Z') (in $(( (next - now) / 60 )) min)"
  sleep $(( next - now ))

  run_backup || true
  sleep 60
done
