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
        if line.startswith(("MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD", "SECRET_KEY")):
            assert line.endswith("=")


@pytest.mark.skipif(shutil.which("openssl") is None, reason="needs openssl")
def test_make_env_writes_private_random_secrets_once(tmp_path):
    for name in ("make-env.sh", ".env.example"):
        shutil.copy(DEPLOY / name, tmp_path / name)
    script = tmp_path / "make-env.sh"
    subprocess.run(["sh", str(script)], check=True, capture_output=True)
    env = dict(line.split("=", 1) for line in (tmp_path / ".env").read_text().splitlines() if "=" in line)
    secrets = [env["MYSQL_PASSWORD"], env["MYSQL_ROOT_PASSWORD"], env["SECRET_KEY"]]
    assert [len(s) for s in secrets] == [32, 32, 64]
    assert len(set(secrets)) == 3
    assert stat.S_IMODE((tmp_path / ".env").stat().st_mode) == 0o600
    # A second run would change the MySQL password and lock the app out of its own data.
    again = subprocess.run(["sh", str(script)], capture_output=True, text=True)
    assert again.returncode == 1
    assert "already exists" in again.stderr
    assert (
        dict(line.split("=", 1) for line in (tmp_path / ".env").read_text().splitlines() if "=" in line)
        == env
    )


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
