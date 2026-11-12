#!/bin/sh
# Writes deploy/.env from deploy/.env.example with fresh random secrets. It never overwrites an existing
# one, because a new MySQL password wouldn't match the database that's already there.
set -eu
cd "$(dirname "$0")"
if [ -e .env ]; then
  echo "deploy/.env already exists; edit it instead." >&2
  exit 1
fi
secret() { openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
umask 077
sed \
  -e "s|^MYSQL_PASSWORD=.*|MYSQL_PASSWORD=$(secret 32)|" \
  -e "s|^MYSQL_ROOT_PASSWORD=.*|MYSQL_ROOT_PASSWORD=$(secret 32)|" \
  -e "s|^SECRET_KEY=.*|SECRET_KEY=$(secret 64)|" \
  .env.example > .env
echo "Wrote deploy/.env (readable by you only). Add payment and text keys there when you have them."
