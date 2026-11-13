#!/bin/sh
# Nightly MySQL backups (#30). Runs in the `backup` container of deploy/compose.prod.yml (the mysql:8.4
# image, so mysqldump matches the server). See deploy/README.md for setting it up and restoring.
#
#   backup.sh          wait for BACKUP_AT (UTC, which is Ghana time) every night and back up
#   backup.sh once     back up now (docker compose ... exec backup sh /backup/backup.sh once)
#
# Each backup is a gzipped mysqldump in /backups (the last BACKUP_KEEP_LOCAL are kept there), copied to
# Oracle Object Storage through BACKUP_UPLOAD_URL, a write-only pre-authenticated request for the bucket:
# daily/<name> every night and weekly/<name> on Sundays. The bucket's lifecycle rules delete old copies,
# because a write-only link can't (and so a break-in on the server can't delete the backups either).
# Every try adds a row to backup_runs, which the admin dashboard reads.
set -u

DIR=${BACKUP_DIR:-/backups}
KEEP_LOCAL=${BACKUP_KEEP_LOCAL:-7}
AT=${BACKUP_AT:-02:00}
UPLOAD_URL=${BACKUP_UPLOAD_URL:-}

log() { echo "$(date -u '+%Y-%m-%d %H:%M:%S') backup: $*"; }

# The password goes in a private options file rather than on a command line other users could see.
CNF=$(mktemp)
trap 'rm -f "$CNF"' EXIT
chmod 600 "$CNF"
printf '[client]\nhost=%s\nuser=%s\npassword=%s\n' "${DB_HOST:-db}" "$MYSQL_USER" "$MYSQL_PASSWORD" > "$CNF"

sql_text() { if [ -n "$1" ]; then printf "'%s'" "$1"; else printf NULL; fi; }
sql_number() { if [ -n "$1" ]; then printf '%s' "$1"; else printf NULL; fi; }

# record STATUS FILE SIZE ERROR: one row in backup_runs. All values come from this script, never from input.
record() {
  mysql --defaults-extra-file="$CNF" "$MYSQL_DATABASE" -e "INSERT INTO backup_runs \
(started_at, finished_at, status, file, size_bytes, error) VALUES ('$STARTED', UTC_TIMESTAMP(), '$1', \
$(sql_text "$2"), $(sql_number "$3"), $(sql_text "$4"))" || log "couldn't record the result in the database"
}

# upload FILE OBJECT_NAME: PUT it to the bucket. Content-MD5 makes Object Storage refuse a damaged copy.
upload() {
  md5=$(openssl dgst -md5 -binary "$1" | base64)
  curl -fsS --retry 3 --retry-delay 30 -o /dev/null -X PUT -H "Content-MD5: $md5" \
    --upload-file "$1" "${UPLOAD_URL}$2"
}

backup_once() {
  STARTED=$(date -u '+%Y-%m-%d %H:%M:%S')
  name="altheo-$(date -u +%Y-%m-%dT%H%MZ).sql.gz"
  file="$DIR/$name"
  part="$DIR/.$name.part"
  mkdir -p "$DIR"
  log "dumping the database to $name"

  # --single-transaction gives a consistent copy without stopping the app.
  { mysqldump --defaults-extra-file="$CNF" --single-transaction --no-tablespaces --routines --triggers \
      --set-gtid-purged=OFF "$MYSQL_DATABASE" || echo failed > "$part.err"; } | gzip -9 > "$part"
  # mysqldump ends a complete dump with "-- Dump completed"; reading it back also checks the gzip.
  if [ -e "$part.err" ] || ! gzip -dc "$part" | tail -n 1 | grep -q '^-- Dump completed'; then
    rm -f "$part" "$part.err"
    log "FAILED: the dump didn't complete"
    record failed "" "" "dump failed"
    return 1
  fi
  mv "$part" "$file"
  size=$(wc -c < "$file" | tr -d ' ')
  log "dumped $size bytes"

  # Keep only the newest few on the server; the Object Storage copies are the ones that matter.
  ls -1 "$DIR"/altheo-*.sql.gz 2>/dev/null | sort | head -n "-$KEEP_LOCAL" | while read -r old; do
    rm -f "$old"
  done

  if [ -z "$UPLOAD_URL" ]; then
    log "WARNING: BACKUP_UPLOAD_URL isn't set, so this backup is only on the server"
    record local_only "$name" "$size" ""
    return 0
  fi
  if ! upload "$file" "daily/$name"; then
    log "FAILED: couldn't copy $name to Object Storage (kept on the server)"
    record failed "$name" "$size" "upload failed"
    return 1
  fi
  # Sunday (7) also goes to weekly/. BACKUP_WEEKDAY only exists so tests can pick the day.
  if [ "${BACKUP_WEEKDAY:-$(date -u +%u)}" = 7 ] && ! upload "$file" "weekly/$name"; then
    log "FAILED: couldn't copy the weekly copy of $name to Object Storage"
    record failed "$name" "$size" "weekly upload failed"
    return 1
  fi
  log "copied $name to Object Storage"
  record ok "$name" "$size" ""
}

seconds_until_next() {
  now=$(date -u +%s)
  next=$(date -u -d "today $AT" +%s)
  [ "$next" -gt "$now" ] || next=$(date -u -d "tomorrow $AT" +%s)
  echo $((next - now))
}

case "${1:-nightly}" in
  once) backup_once ;;
  nightly)
    log "running every night at $AT UTC"
    while true; do
      sleep "$(seconds_until_next)"
      backup_once || true
      sleep 60
    done
    ;;
  *) echo "usage: backup.sh [once]" >&2; exit 2 ;;
esac
