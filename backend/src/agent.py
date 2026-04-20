"""Agent construction module.

Constructs the shared CompiledStateGraph lazily.
"""
import os
import logging
from typing import Optional

from deepagents import create_deep_agent
from langchain.chat_models import init_chat_model
from langchain_tavily import TavilySearch
from langgraph.graph.state import CompiledStateGraph
from dotenv import load_dotenv, find_dotenv

_ = load_dotenv(find_dotenv())

logger = logging.getLogger("backend")

# Global singleton for the agent
_agent: Optional[CompiledStateGraph] = None

def get_agent() -> CompiledStateGraph:
    """Return the shared compiled deep agent (memoized)."""
    global _agent
    if _agent is None:
        # Import DB dependencies only when needed
        try:
            from langgraph.checkpoint.postgres import PostgresSaver
            from psycopg_pool import ConnectionPool
        except ImportError as e:
            logger.error("Failed to import database dependencies: %s", e)
            raise RuntimeError("Database dependencies (psycopg, libpq) are required to run the agent.") from e

        db_uri = os.getenv("DB_URI")
        if not db_uri:
            raise RuntimeError("DB_URI environment variable is not set")

        logger.info("Initializing Postgres checkpointer...")
        pool = ConnectionPool(
            conninfo=db_uri,
            kwargs={"autocommit": True, "prepare_threshold": 0}
        )
        checkpointer = PostgresSaver(pool)
        checkpointer.setup()

        logger.info("Creating deep agent instance...")
        _agent = create_deep_agent(
            model=init_chat_model(model="openai:gpt-4.1-nano", temperature=0),
            tools=[TavilySearch(search_results=5)],
            checkpointer=checkpointer,
        )
    return _agent