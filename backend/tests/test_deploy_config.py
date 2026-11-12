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
