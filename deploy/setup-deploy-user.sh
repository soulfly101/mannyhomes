#!/bin/sh
# Sets up the restricted `deploy` user that GitHub Actions uses to deploy (#31). Run once on the server:
#
#   sudo /srv/altheo/deploy/setup-deploy-user.sh 'ssh-ed25519 AAAA... github-deploy'
#
# The key can do exactly one thing: run deploy/deploy.sh (as opc, who runs the app) with a commit sha. No
# shell, no file copying, no port forwarding, and the user has no password. Running it again replaces the key.
set -eu

if [ "$(id -u)" != 0 ]; then
  echo "Run it with sudo." >&2
  exit 1
fi
key=${1:-}
case "$key" in
  "ssh-ed25519 "*) ;;
  *) echo "Give the deploy public key (one line starting with ssh-ed25519) in quotes." >&2; exit 1 ;;
esac

if ! id deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/sh --comment "GitHub Actions deploys (#31)" deploy
fi
passwd -l deploy >/dev/null 2>&1 || true

install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
# `restrict` turns off everything (shell, forwarding, terminals); `command` is the only thing it runs.
{
  printf '%s' 'restrict,command="sudo -n -H -u opc /srv/altheo/deploy/deploy.sh \"$SSH_ORIGINAL_COMMAND\"" '
  printf '%s\n' "$key"
} > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
command -v restorecon >/dev/null && restorecon -R /home/deploy/.ssh

rules=$(mktemp)
cat > "$rules" <<'EOF'
# GitHub Actions deploys (#31): the deploy user may run the deploy script as opc, and nothing else.
Defaults:deploy !requiretty
deploy ALL=(opc) NOPASSWD: /srv/altheo/deploy/deploy.sh
EOF
visudo -cf "$rules" >/dev/null
install -m 440 -o root -g root "$rules" /etc/sudoers.d/altheo-deploy
rm -f "$rules"

echo "The deploy user is ready. GitHub can now deploy with its key."
