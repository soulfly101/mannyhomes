from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app import models  # noqa: F401  (registers the tables on Base.metadata)
from app.config import get_settings
from app.db import Base

config = context.config
if config.config_file_name and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)


def run_migrations() -> None:
    url = get_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL is not set; can't run migrations.")
    engine = create_engine(url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


run_migrations()
