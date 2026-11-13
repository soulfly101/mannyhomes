#!/bin/sh
# Deploys one commit of main to this server (#31). GitHub Actions runs it after the tests pass, through the
# restricted `deploy` SSH user (see deploy/setup-deploy-user.sh), sending the backend image built for Arm:
#
#   ssh deploy@server <commit sha> < image.tar.gz
#
# It refuses anything that isn't on main or is older than what's running, checks the new image can start,
# takes a database backup, switches over (migrations run as the backend starts), and waits for the health
# check. If that fails, it puts the previous image and files back and exits 1, so the old version runs on.
#
# Everything is inside main() so the shell has read the whole script before `git merge` can replace it.
set -eu

main() {
  sha=${1:-}
  dir=${ALTHEO_DIR:-/srv/altheo}
  tries=${HEALTH_TRIES:-48}
  wait=${HEALTH_WAIT:-5}

  case "$sha" in
    *[!0-9a-f]* | "") fail "expected a full commit sha, got '$sha'" ;;
  esac
  [ ${#sha} -eq 40 ] || fail "expected a full 40-character commit sha"

  # One deploy at a time.
  exec 9>"${ALTHEO_LOCK:-/tmp/altheo-deploy.lock}"
  flock -n 9 || fail "another deploy is still running"

  cd "$dir"
  [ -z "$(git status --porcelain --untracked-files=no)" ] || fail "the server's checkout has local changes"
  git fetch -q origin main
  git cat-file -e "$sha^{commit}" 2>/dev/null || fail "$sha isn't a commit on GitHub"
  git merge-base --is-ancestor "$sha" origin/main || fail "$sha isn't on main"
  previous=$(git rev-parse HEAD)
  if [ "$sha" != "$previous" ] && git merge-base --is-ancestor "$sha" "$previous"; then
    fail "$sha is older than what's running ($previous)"
  fi

  log "loading the new backend image"
  gzip -dc | docker load -q >/dev/null
  docker image inspect "altheo-backend:$sha" >/dev/null 2>&1 || fail "the upload didn't contain altheo-backend:$sha"
  # Catches a broken build before the running app is touched.
  docker run --rm --entrypoint python "altheo-backend:$sha" \
    -c "import sys; sys.path.insert(0, 'src'); import app.main" >/dev/null ||
    fail "the new version doesn't start; nothing was changed"

  running=$(compose ps -q backend)
  previous_image=$(if [ -n "$running" ]; then docker inspect -f '{{.Image}}' "$running"; fi)
  [ -z "$previous_image" ] || docker tag "$previous_image" altheo-backend:previous

  log "backing up the database first"
  compose exec -T backup sh /backup/backup.sh once >/dev/null 2>&1 ||
    log "WARNING: the backup before deploying failed (see the dashboard); deploying anyway"

  log "switching to $sha"
  git merge -q --ff-only "$sha"
  docker tag "altheo-backend:$sha" altheo-backend:latest
  compose up -d --no-build

  if healthy; then
    # Keep this version and the previous one; drop older images.
    docker images altheo-backend --format '{{.Tag}}' | grep -E '^[0-9a-f]{40}$' | grep -v "^$sha\$" |
      while read -r old; do docker rmi -f "altheo-backend:$old" >/dev/null 2>&1 || true; done
    docker image prune -f >/dev/null 2>&1 || true
    log "deployed $sha"
    return 0
  fi

  log "FAILED: the new version didn't pass its health check; going back to $previous"
  compose logs --tail 40 backend || true
  git checkout -q -B main "$previous"
  if [ -n "$previous_image" ]; then
    docker tag altheo-backend:previous altheo-backend:latest
  fi
  compose up -d --no-build
  if healthy; then log "rolled back; the previous version is running"; else log "ROLLBACK ALSO UNHEALTHY: check the server"; fi
  exit 1
}

log() { echo "$(date -u '+%Y-%m-%d %H:%M:%S') deploy: $*"; }
fail() { log "refused: $*" >&2; exit 2; }
compose() { docker compose -f deploy/compose.prod.yml --env-file deploy/.env "$@"; }

# Waits for the backend container's own health check (it checks the database too).
healthy() {
  i=0
  while [ "$i" -lt "$tries" ]; do
    id=$(compose ps -q backend)
    status=$(if [ -n "$id" ]; then docker inspect -f '{{.State.Health.Status}}' "$id"; fi)
    case "$status" in
      healthy) return 0 ;;
      unhealthy) return 1 ;;
    esac
    i=$((i + 1))
    sleep "$wait"
  done
  return 1
}

main "$@"
exit
