"""Configuration and per-request database sessions."""

import os
from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session


@lru_cache
def database() -> Engine:
    return create_engine(
        os.environ.get("DATABASE_URL", "postgresql+psycopg://markov:markov@127.0.0.1:5432/markov"),
        pool_pre_ping=True,
        pool_timeout=5,
        connect_args={"connect_timeout": 5, "options": "-c statement_timeout=5000"},
    )


def session() -> Iterator[Session]:
    with Session(database()) as db:
        yield db
