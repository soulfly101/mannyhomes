"""Point the tests at their own database before the app reads its settings.

Under docker compose, TEST_DATABASE_URL names a separate `<db>_test` database, so running the tests never
touches the data you've entered in the app. It's created if missing. CI sets DATABASE_URL to a test database
directly, and without either variable the database tests are skipped.
"""

import os

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

_test_url = os.environ.get("TEST_DATABASE_URL")
if _test_url:
    url = make_url(_test_url)
    server = create_engine(url.set(database=""))
    with server.connect() as conn:
        conn.execute(text(f"CREATE DATABASE IF NOT EXISTS `{url.database}`"))
    server.dispose()
    os.environ["DATABASE_URL"] = _test_url
