"""Checks on the production setup in deploy/ (#28), so a later edit can't quietly make it unsafe."""

import os
import re
import shutil
import stat
import subprocess
from pathlib import Path

import pytest
import yaml

from app.config import Settings

DEPLOY = Path(os.environ.get("DEPLOY_DIR", Path(__file__).resolve().parents[2] / "deploy"))
pytestmark = pytest.mark.skipif(
    not (DEPLOY / "compose.prod.yml").exists(), reason="deploy/ isn't here (e.g. in the dev container)"
)


@pytest.fixture(scope="module")
def compose():
    return yaml.safe_load((DEPLOY / "compose.prod.yml").read_text())


def test_both_services_restart_by_themselves(compose):
    for service in compose["services"].values():
        assert service["restart"] == "unless-stopped"


def test_no_source_mounts_or_hot_reload(compose):
    backend = compose["services"]["backend"]
    assert "volumes" not in backend
    assert "--reload" not in backend["command"]
    assert "alembic upgrade head" in backend["command"]
    assert backend["environment"]["APP_ENV"] == "production"


def test_the_database_keeps_its_data_and_isnt_published(compose):
    db = compose["services"]["db"]
    assert db["volumes"] == ["mysql-data:/var/lib/mysql"]
    assert "mysql-data" in compose["volumes"]
    assert "ports" not in db


def test_the_backend_is_only_reachable_from_the_server_itself(compose):
    assert compose["services"]["backend"]["ports"] == ["127.0.0.1:8000:8000"]


def test_only_caddy_faces_the_internet(compose):
    services = compose["services"].items()
    published = {name: service["ports"] for name, service in services if "ports" in service}
    assert published == {"backend": ["127.0.0.1:8000:8000"], "caddy": ["80:80", "443:443"]}


def test_caddy_keeps_its_certificates_and_needs_a_host(compose):
    caddy = compose["services"]["caddy"]
    assert "caddy-data:/data" in caddy["volumes"]
    assert "caddy-data" in compose["volumes"]
    assert caddy["depends_on"]["backend"]["condition"] == "service_healthy"
    assert "${API_HOST:?" in (DEPLOY / "compose.prod.yml").read_text()


def test_caddy_never_logs_the_website_secret():
    # Caddy logs request headers; the Cloudflare function's PROXY_SECRET (#32) arrives in one of them.
    text = (DEPLOY / "Caddyfile").read_text()
    # Both the request log and the default log (where errors, e.g. the backend being down, go).
    assert len(re.findall(r"format filter \{[^}]*request>headers>X-Altheo-Proxy-Key delete", text)) == 2
    assert re.search(r"log default \{\s*output stdout\s*format filter", text)


def test_caddy_serves_only_the_api():
    text = (DEPLOY / "Caddyfile").read_text()
    assert "{$API_HOST} {" in text
    assert "handle /api/* {" in text
    assert "reverse_proxy backend:8000" in text
    # Everything else (e.g. FastAPI's /docs) gets a 404, and the proxy is the only route to the backend.
    assert 'respond "Not found" 404' in text
    assert text.count("reverse_proxy") == 1
    # Caddy must not trust X-Forwarded-For from visitors, or anyone could fake their address.
    assert "trusted_proxies" not in text


def test_secrets_must_be_set_and_none_are_written_in(compose):
    text = (DEPLOY / "compose.prod.yml").read_text()
    for name in ("MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD", "SECRET_KEY"):
        assert f"${{{name}:?" in text
    assert "dev-only-insecure" not in text


def test_every_backend_setting_is_one_the_app_reads(compose):
    known = {name.upper() for name in Settings.model_fields}
    assert set(compose["services"]["backend"]["environment"]) <= known


def test_the_example_lists_every_variable_the_compose_file_uses():
    used = set(re.findall(r"\$\{([A-Z_]+)", (DEPLOY / "compose.prod.yml").read_text()))
    example = {
        line.split("=", 1)[0]
        for line in (DEPLOY / ".env.example").read_text().splitlines()
        if line and not line.startswith("#")
    }
    assert used <= example
    # The example itself holds no secrets.
    for line in (DEPLOY / ".env.example").read_text().splitlines():
        if line.startswith(("MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD", "SECRET_KEY", "PROXY_SECRET")):
            assert line.endswith("=")


@pytest.mark.skipif(shutil.which("openssl") is None, reason="needs openssl")
def test_make_env_writes_private_random_secrets_once(tmp_path):
    for name in ("make-env.sh", ".env.example"):
        shutil.copy(DEPLOY / name, tmp_path / name)
    script = tmp_path / "make-env.sh"
    subprocess.run(["sh", str(script)], check=True, capture_output=True)
    env = dict(line.split("=", 1) for line in (tmp_path / ".env").read_text().splitlines() if "=" in line)
    secrets = [env["MYSQL_PASSWORD"], env["MYSQL_ROOT_PASSWORD"], env["SECRET_KEY"], env["PROXY_SECRET"]]
    assert [len(s) for s in secrets] == [32, 32, 64, 48]
    assert len(set(secrets)) == 4
    assert stat.S_IMODE((tmp_path / ".env").stat().st_mode) == 0o600
    # A second run would change the MySQL password and lock the app out of its own data.
    again = subprocess.run(["sh", str(script)], capture_output=True, text=True)
    assert again.returncode == 1
    assert "already exists" in again.stderr
    assert (
        dict(line.split("=", 1) for line in (tmp_path / ".env").read_text().splitlines() if "=" in line)
        == env
    )


def test_the_backend_gets_the_website_proxy_secret(compose):
    # The website's Cloudflare function (#32) proves itself with it before saying who the visitor is.
    assert compose["services"]["backend"]["environment"]["PROXY_SECRET"] == "${PROXY_SECRET:-}"


# --- Nightly backups (#30) ---------------------------------------------------------------------------


def test_the_backup_job_runs_by_itself_and_publishes_nothing(compose):
    backup = compose["services"]["backup"]
    assert backup["image"] == compose["services"]["db"]["image"]  # mysqldump matches the server
    assert backup["restart"] == "unless-stopped"
    assert "ports" not in backup
    assert "./backup:/backup:ro,z" in backup["volumes"]
    assert "backups:/backups" in backup["volumes"]
    assert "backups" in compose["volumes"]
    # It never gets the root password; the app's own user is enough to dump the app's database.
    assert "MYSQL_ROOT_PASSWORD" not in backup["environment"]


FAKE_DUMP = """#!/bin/sh
echo "$@" >> "$FAKE_LOG.dump"
[ -z "${FAKE_DUMP_FAIL:-}" ] || exit 2
echo "CREATE TABLE users (id int);"
echo "-- Dump completed on 2026-11-13  2:00:01"
"""
FAKE_MYSQL = """#!/bin/sh
echo "$@" >> "$FAKE_LOG.mysql"
"""
FAKE_CURL = """#!/bin/sh
echo "$@" >> "$FAKE_LOG.curl"
exit "${FAKE_CURL_EXIT:-0}"
"""


@pytest.fixture
def backup(tmp_path):
    """Runs backup.sh once with stand-in mysqldump, mysql and curl, and reports what they were asked."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in (("mysqldump", FAKE_DUMP), ("mysql", FAKE_MYSQL), ("curl", FAKE_CURL)):
        (bin_dir / name).write_text(body)
        (bin_dir / name).chmod(0o755)
    out = tmp_path / "backups"
    log = tmp_path / "log"

    def run(**env):
        result = subprocess.run(
            ["sh", str(DEPLOY / "backup" / "backup.sh"), "once"],
            capture_output=True,
            text=True,
            env={
                "PATH": f"{bin_dir}:{os.environ['PATH']}",
                "BACKUP_DIR": str(out),
                "MYSQL_DATABASE": "altheo",
                "MYSQL_USER": "altheo",
                "MYSQL_PASSWORD": "s3cretpw",
                "BACKUP_WEEKDAY": "3",
                "FAKE_LOG": str(log),
                **env,
            },
        )

        def read(kind):
            path = Path(f"{log}.{kind}")
            return path.read_text() if path.exists() else ""

        return result, sorted(p.name for p in out.glob("altheo-*.sql.gz")), read

    return run, out


needs_tools = pytest.mark.skipif(
    not all(shutil.which(t) for t in ("openssl", "gzip", "base64")), reason="needs openssl, gzip, base64"
)
URL = "https://objectstorage.example/p/token/n/ns/b/altheo-backups/o/"


@needs_tools
def test_a_backup_is_dumped_checked_copied_off_and_recorded(backup):
    run, out = backup
    result, files, read = run(BACKUP_UPLOAD_URL=URL)
    assert result.returncode == 0, result.stdout + result.stderr
    assert len(files) == 1
    assert subprocess.run(["gzip", "-t", str(out / files[0])]).returncode == 0
    dump_args = read("dump")
    assert "--single-transaction" in dump_args
    # The password is in a private options file, never on the command line.
    assert "s3cretpw" not in dump_args + read("mysql") + read("curl")
    curl = read("curl")
    assert f"{URL}daily/{files[0]}" in curl
    assert "Content-MD5:" in curl
    assert "weekly/" not in curl
    assert "'ok'" in read("mysql")


@needs_tools
def test_sundays_also_go_to_the_weekly_folder(backup):
    run, _ = backup
    result, files, read = run(BACKUP_UPLOAD_URL=URL, BACKUP_WEEKDAY="7")
    assert result.returncode == 0
    curl = read("curl")
    assert f"daily/{files[0]}" in curl
    assert f"weekly/{files[0]}" in curl


@needs_tools
def test_without_an_upload_link_the_backup_stays_on_the_server_and_says_so(backup):
    run, _ = backup
    result, files, read = run()
    assert result.returncode == 0
    assert len(files) == 1
    assert read("curl") == ""
    assert "'local_only'" in read("mysql")
    assert "only on the server" in result.stdout


@needs_tools
def test_a_failed_dump_is_recorded_and_leaves_no_half_file(backup):
    run, out = backup
    result, files, read = run(BACKUP_UPLOAD_URL=URL, FAKE_DUMP_FAIL="1")
    assert result.returncode == 1
    assert files == []
    assert list(out.iterdir()) == []
    assert read("curl") == ""
    assert "'failed'" in read("mysql") and "'dump failed'" in read("mysql")


@needs_tools
def test_a_failed_upload_is_recorded_and_the_backup_is_kept_on_the_server(backup):
    run, _ = backup
    result, files, read = run(BACKUP_UPLOAD_URL=URL, FAKE_CURL_EXIT="22")
    assert result.returncode == 1
    assert len(files) == 1
    assert "'upload failed'" in read("mysql")


@needs_tools
def test_only_the_newest_backups_are_kept_on_the_server(backup):
    run, out = backup
    out.mkdir()
    for day in range(1, 10):
        (out / f"altheo-2026-10-{day:02d}T0200Z.sql.gz").write_bytes(b"old")
    result, files, _ = run(BACKUP_KEEP_LOCAL="3")
    assert result.returncode == 0
    assert len(files) == 3
    assert files[:2] == ["altheo-2026-10-08T0200Z.sql.gz", "altheo-2026-10-09T0200Z.sql.gz"]


def test_restore_never_replaces_the_live_database_by_accident():
    text = (DEPLOY / "backup" / "restore.sh").read_text()
    assert 'REPLACE_LIVE_DATABASE:-}" != yes' in text
    assert "Stop the backend first" in text
    assert "already exists" in text


# --- Automatic deploys (#31) -------------------------------------------------------------------------

WORKFLOW = DEPLOY.parent / ".github" / "workflows" / "deploy.yml"
NEW = "a" * 40
OLD = "b" * 40

FAKE_DOCKER = r"""#!/bin/sh
echo "docker $*" >> "$FAKE_LOG"
case "$1" in
  load) cat > /dev/null ;;
  image) [ "$2" = inspect ] && exit "${FAKE_IMAGE_MISSING:-0}" ;;
  run) exit "${FAKE_IMPORT_EXIT:-0}" ;;
  inspect)
    case "$3" in
      *Health*)
        n=$(cat "$FAKE_LOG.n" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$FAKE_LOG.n"
        echo "$FAKE_HEALTH" | tr ' ' '\n' | sed -n "${n}p" ;;
      *) echo sha256:oldimage ;;
    esac ;;
  compose) case "$*" in *"ps -q backend"*) echo cid123 ;; esac ;;
  images) printf '%s\n' latest previous "$FAKE_OLD_TAG" ;;
esac
exit 0
"""
FAKE_GIT = r"""#!/bin/sh
echo "git $*" >> "$FAKE_LOG"
case "$1" in
  status) [ -z "${FAKE_DIRTY:-}" ] || echo " M deploy/compose.prod.yml" ;;
  cat-file) exit "${FAKE_NOT_COMMIT:-0}" ;;
  merge-base)
    if [ "$4" = origin/main ]; then exit "${FAKE_OFF_MAIN:-0}"; else exit "${FAKE_OLDER:-1}"; fi ;;
  rev-parse) echo "$FAKE_PREVIOUS" ;;
  diff) [ -z "${FAKE_DIFF:-}" ] || echo "$FAKE_DIFF" ;;
esac
exit 0
"""


@pytest.fixture
def deploy(tmp_path):
    """Runs deploy.sh with stand-in docker, git and friends; returns the result and every command it ran."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fakes = {
        "docker": FAKE_DOCKER,
        "git": FAKE_GIT,
        "flock": "#!/bin/sh\nexit 0\n",
        "sleep": "#!/bin/sh\nexit 0\n",
        "gzip": "#!/bin/sh\ncat\n",
    }
    for name, body in fakes.items():
        (bin_dir / name).write_text(body)
        (bin_dir / name).chmod(0o755)
    log = tmp_path / "calls"
    log.write_text("")

    def run(sha=NEW, **env):
        log.write_text("")
        Path(f"{log}.n").unlink(missing_ok=True)
        result = subprocess.run(
            ["sh", str(DEPLOY / "deploy.sh"), sha],
            input="image bytes",
            capture_output=True,
            text=True,
            env={
                "PATH": f"{bin_dir}:{os.environ['PATH']}",
                "ALTHEO_DIR": str(tmp_path),
                "ALTHEO_LOCK": str(tmp_path / "lock"),
                "HEALTH_TRIES": "5",
                "FAKE_LOG": str(log),
                "FAKE_PREVIOUS": OLD,
                "FAKE_HEALTH": "starting healthy",
                "FAKE_OLD_TAG": "c" * 40,
                **env,
            },
        )
        return result, log.read_text().splitlines()

    return run


@pytest.mark.parametrize("sha", ["", "main", "abc123", "A" * 40, "a" * 39, "a" * 40 + ";reboot"])
def test_deploy_only_takes_a_full_commit_sha(deploy, sha):
    result, calls = deploy(sha)
    assert result.returncode == 2
    assert calls == []


@pytest.mark.parametrize(
    "env, reason",
    [
        ({"FAKE_DIRTY": "1"}, "local changes"),
        ({"FAKE_NOT_COMMIT": "1"}, "isn't a commit"),
        ({"FAKE_OFF_MAIN": "1"}, "isn't on main"),
        ({"FAKE_OLDER": "0"}, "older than what's running"),
    ],
)
def test_deploy_refuses_anything_but_a_newer_commit_of_main(deploy, env, reason):
    result, calls = deploy(**env)
    assert result.returncode == 2
    assert reason in result.stderr
    assert not any(c.startswith("docker") for c in calls)


def test_a_new_version_that_doesnt_start_never_touches_the_running_app(deploy):
    result, calls = deploy(FAKE_IMPORT_EXIT="1")
    assert result.returncode == 2
    assert "doesn't start" in result.stderr
    assert not any("up -d" in c or c.startswith("git merge -q") for c in calls)


def test_a_healthy_deploy_backs_up_switches_and_keeps_the_previous_image(deploy):
    result, calls = deploy()
    assert result.returncode == 0, result.stdout + result.stderr
    assert f"deployed {NEW}" in result.stdout
    order = [
        "docker load -q",
        "docker tag sha256:oldimage altheo-backend:previous",
        "backup sh /backup/backup.sh once",
        f"git merge -q --ff-only {NEW}",
        f"docker tag altheo-backend:{NEW} altheo-backend:latest",
        "up -d --no-build",
    ]
    positions = [next(i for i, c in enumerate(calls) if step in c) for step in order]
    assert positions == sorted(positions)
    # Older images go; this one and the previous one stay.
    assert f"docker rmi -f altheo-backend:{'c' * 40}" in calls
    assert not any(f"rmi -f altheo-backend:{NEW}" in c for c in calls)


def test_caddy_and_the_backup_job_restart_only_when_their_files_change(deploy):
    _, calls = deploy()
    assert not any("--force-recreate" in c for c in calls)
    result, calls = deploy(FAKE_DIFF="deploy/Caddyfile")
    assert result.returncode == 0
    assert any(c.endswith("up -d --no-build --force-recreate caddy backup") for c in calls)


def test_a_failed_health_check_puts_the_previous_version_back(deploy):
    result, calls = deploy(FAKE_HEALTH="starting unhealthy healthy")
    assert result.returncode == 1
    assert "going back" in result.stdout
    assert "rolled back; the previous version is running" in result.stdout
    after = calls[next(i for i, c in enumerate(calls) if "up -d --no-build" in c) + 1 :]
    assert f"git checkout -q -B main {OLD}" in after
    assert "docker tag altheo-backend:previous altheo-backend:latest" in after
    assert any("up -d --no-build" in c for c in after)


def test_a_deploy_that_never_becomes_healthy_also_rolls_back(deploy):
    result, calls = deploy(FAKE_HEALTH="starting")
    assert result.returncode == 1
    assert any(f"checkout -q -B main {OLD}" in c for c in calls)


def test_setup_gives_the_deploy_key_one_command_and_nothing_else():
    text = (DEPLOY / "setup-deploy-user.sh").read_text()
    assert "restrict,command=" in text
    assert "sudo -n -H -u opc /srv/altheo/deploy/deploy.sh" in text
    assert "deploy ALL=(opc) NOPASSWD: /srv/altheo/deploy/deploy.sh" in text
    assert "visudo -cf" in text
    assert "passwd -l deploy" in text


@pytest.mark.skipif(not WORKFLOW.exists(), reason=".github isn't here")
def test_the_workflow_deploys_only_tested_pushes_to_main():
    flow = yaml.safe_load(WORKFLOW.read_text())
    triggers = flow[True]  # YAML reads the bare `on:` key as True
    assert triggers["workflow_run"] == {"workflows": ["Tests"], "types": ["completed"], "branches": ["main"]}
    assert set(triggers) == {"workflow_run", "workflow_dispatch"}
    job = flow["jobs"]["deploy"]
    condition = " ".join(job["if"].split())
    assert "github.event.workflow_run.conclusion == 'success'" in condition
    assert "github.event.workflow_run.event == 'push'" in condition
    assert "github.ref == 'refs/heads/main'" in condition
    assert flow["concurrency"]["cancel-in-progress"] is False
    assert flow["permissions"] == {"contents": "read"}
    assert job["runs-on"].endswith("-arm")


@pytest.mark.skipif(not WORKFLOW.exists(), reason=".github isn't here")
def test_the_workflow_pins_the_server_and_never_prints_the_key():
    text = WORKFLOW.read_text()
    assert "StrictHostKeyChecking=yes" in text
    assert "HOST_KEY: ssh-ed25519 " in text
    assert "secrets.DEPLOY_SSH_KEY" in text
    assert "echo $DEPLOY_SSH_KEY" not in text and "cat ~/.ssh/deploy_key" not in text
    assert "rm -f ~/.ssh/deploy_key" in text
