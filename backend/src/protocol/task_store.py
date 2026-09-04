"""A2A TaskStore factory — Postgres when ``DB_URI`` is set, else in-memory.

Uses the pinned ``a2a-sdk==1.1.2`` ``DatabaseTaskStore`` (verified against
the installed ``a2a.server.tasks.database_task_store``). Table name is
``a2a_tasks`` so it does not collide with LangGraph checkpoint tables.
"""

import logging
import os

from a2a.server.tasks import InMemoryTaskStore, TaskStore

logger = logging.getLogger("backend")

A2A_TASKS_TABLE = "a2a_tasks"


def sqlalchemy_url_from_db_uri(db_uri: str) -> str:
    """Point SQLAlchemy at psycopg3 using the same ``DB_URI`` as the app."""
    if db_uri.startswith("postgresql+"):
        return db_uri
    if db_uri.startswith("postgresql://"):
        return "postgresql+psycopg://" + db_uri.removeprefix("postgresql://")
    return db_uri


def build_task_store() -> TaskStore:
    """Return a TaskStore. Postgres via PgBouncer when ``DB_URI`` is set."""
    db_uri = os.getenv("DB_URI", "").strip()
    if not db_uri:
        logger.warning("DB_URI unset; A2A task store is in-memory")
        return InMemoryTaskStore()

    from a2a.server.tasks import DatabaseTaskStore
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(
        sqlalchemy_url_from_db_uri(db_uri),
        pool_pre_ping=True,
        connect_args={"prepare_threshold": 0},
    )
    store = DatabaseTaskStore(
        engine=engine,
        create_table=True,
        table_name=A2A_TASKS_TABLE,
    )
    logger.info("A2A task store: Postgres table %s", A2A_TASKS_TABLE)
    return store


_store: TaskStore | None = None


def get_task_store() -> TaskStore:
    global _store
    if _store is None:
        _store = build_task_store()
    return _store


async def init_task_store() -> None:
    """Create ``a2a_tasks`` if the store supports ``initialize``."""
    store = get_task_store()
    initialize = getattr(store, "initialize", None)
    if initialize is not None:
        await initialize()
