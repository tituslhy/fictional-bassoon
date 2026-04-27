import os
import logging
from psycopg_pool import AsyncConnectionPool

logger = logging.getLogger("backend")

_pool = None

async def get_db_pool() -> AsyncConnectionPool:
    global _pool
    if _pool is None:
        db_uri = os.getenv("DB_URI")
        if not db_uri:
            raise RuntimeError("DB_URI environment variable is not set")
        
        logger.info("Initializing global Async Postgres pool...")
        _pool = AsyncConnectionPool(
            conninfo=db_uri,
            kwargs={"autocommit": True, "prepare_threshold": 0},
            open=False
        )
        await _pool.open()
    return _pool

async def close_db_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
