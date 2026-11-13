#!/bin/sh
# Restores a backup made by backup.sh (#30) into a database. Run on the server from anywhere in the repo:
#
#   deploy/backup/restore.sh BACKUP DATABASE
#
# BACKUP is a .sql.gz file on the server (e.g. downloaded from Object Storage), or the name of one kept in
# the backup container's /backups. DATABASE must not exist yet, e.g. altheo_restore_test to check that a
# backup is good. Replacing the live database is a separate, deliberate step: see deploy/README.md.
set -eu
cd "$(dirname "$0")/../.."
compose() { docker compose -f deploy/compose.prod.yml --env-file deploy/.env "$@"; }
# mysql as root inside the db container, so no password is typed or shown here.
db_root() { compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot "$@"' sh "$@"; }

if [ $# -ne 2 ]; then
  echo "usage: deploy/backup/restore.sh BACKUP DATABASE" >&2
  exit 2
fi
source=$1
target=$2
case "$target" in
  "" | *[!A-Za-z0-9_]*) echo "The database name may only use letters, digits and _." >&2; exit 2 ;;
esac

live=$(compose exec -T db sh -c 'printf %s "$MYSQL_DATABASE"')
exists=$(db_root -N -e "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = '$target'")
if [ "$target" = "$live" ]; then
  if [ "${REPLACE_LIVE_DATABASE:-}" != yes ]; then
    echo "$target is the live database. To replace it, follow 'Restoring the live database' in deploy/README.md." >&2
    exit 1
  fi
  if [ -n "$(compose ps -q --status running backend)" ]; then
    echo "Stop the backend first (docker compose ... stop backend), so nothing writes while restoring." >&2
    exit 1
  fi
  echo "Replacing the live database $target."
  db_root -e "DROP DATABASE \`$target\`"
elif [ "$exists" != 0 ]; then
  echo "$target already exists. Pick a new name, or drop it first." >&2
  exit 1
fi
db_root -e "CREATE DATABASE \`$target\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"

if [ -f "$source" ]; then
  echo "Restoring $source into $target..."
  gzip -dc "$source" | db_root "$target"
else
  case "$source" in
    altheo-*.sql.gz) ;;
    *) echo "No file $source here, and it isn't the name of a backup in /backups." >&2; exit 1 ;;
  esac
  echo "Restoring /backups/$source (in the backup container) into $target..."
  compose exec -T backup cat "/backups/$source" | gzip -dc | db_root "$target"
fi

tables=$(db_root -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$target'")
version=$(db_root -N -e "SELECT version_num FROM \`$target\`.alembic_version")
echo "Done: $tables tables in $target, at migration $version."
