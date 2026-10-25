from collections.abc import Iterator
from functools import lru_cache

from fastapi import HTTPException
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings


@lru_cache
def get_engine() -> Engine:
    url = get_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL is not set.")
    return create_engine(url, pool_pre_ping=True)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one database session per request."""
    try:
        engine = get_engine()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    with sessionmaker(bind=engine)() as session:
        yield session
