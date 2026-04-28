"""Agent construction module.

Constructs the shared CompiledStateGraph lazily.
"""

import logging
import os

from deepagents import create_deep_agent
from dotenv import find_dotenv, load_dotenv
from langchain.chat_models import init_chat_model
from langchain_tavily import TavilySearch
from langgraph.graph.state import CompiledStateGraph

_ = load_dotenv(find_dotenv())

logger = logging.getLogger("backend")


def create_agent(checkpointer=None) -> CompiledStateGraph:
    """Create a new agent instance with the given checkpointer."""
    logger.info("Creating agent instance...")
    return create_deep_agent(
        model=init_chat_model(model="openai:gpt-5.4-nano", temperature=0),
        tools=[TavilySearch(max_results=5)],
        checkpointer=checkpointer,
    )


async def get_agent() -> CompiledStateGraph:
    """Return an agent instance, initializing a checkpointer if needed.

    Lifecycle contract:
    - Creates an AsyncConnectionPool and opens it
    - Initializes AsyncPostgresSaver and calls setup()
    - Caller must close the pool after use (via agent.checkpointer.conn.close())

    Note: In worker tasks, it is safer to create a fresh checkpointer/pool
    for each task to avoid 'Event loop is closed' errors.
    """
    # Import DB dependencies
    try:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        from psycopg_pool import AsyncConnectionPool
    except ImportError as e:
        logger.error("Failed to import database dependencies: %s", e)
        raise RuntimeError(
            "Database dependencies (psycopg, libpq) are required to run the agent."
        ) from e

    # Get DB URI
    db_uri = os.getenv("DB_URI")
    if not db_uri:
        raise RuntimeError("DB_URI environment variable is not set")

    # Initialize DB pool and checkpointer
    logger.info("Initializing Async Postgres checkpointer...")
    pool = AsyncConnectionPool(
        conninfo=db_uri, kwargs={"autocommit": True, "prepare_threshold": 0}, open=False
    )
    await pool.open()
    checkpointer = AsyncPostgresSaver(pool)
    await checkpointer.setup()

    return create_agent(checkpointer=checkpointer)
