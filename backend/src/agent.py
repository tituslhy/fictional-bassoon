"""Agent construction module.

Constructs the shared CompiledStateGraph lazily.
"""
import os
import logging
import threading

from deepagents import create_deep_agent
from langchain.chat_models import init_chat_model
from langchain_tavily import TavilySearch
from langgraph.graph.state import CompiledStateGraph
from dotenv import load_dotenv, find_dotenv

_ = load_dotenv(find_dotenv())

logger = logging.getLogger("backend")

# Lazy global to avoid module-level DB connection attempts
_AGENT_COMPILED: CompiledStateGraph | None = None
_AGENT_LOCK = threading.Lock()

def get_agent() -> CompiledStateGraph:
    """Return the shared compiled deep agent, initializing it if necessary."""
    global _AGENT_COMPILED
    
    if _AGENT_COMPILED is not None:
        return _AGENT_COMPILED
        
    with _AGENT_LOCK:
        if _AGENT_COMPILED is not None:
            return _AGENT_COMPILED
            
        # Import DB dependencies inside the lock to avoid module-level side effects
        try:
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
            from psycopg_pool import AsyncConnectionPool
        except ImportError as e:
            logger.error("Failed to import database dependencies: %s", e)
            raise RuntimeError("Database dependencies (psycopg, libpq) are required to run the agent.") from e

        # Get DB URI
        db_uri = os.getenv("DB_URI")
        if not db_uri:
            raise RuntimeError("DB_URI environment variable is not set")

        # Initialize DB pool and checkpointer
        # We explicitly use AsyncConnectionPool so we can manage its lifecycle
        logger.info("Initializing Async Postgres checkpointer...")
        pool = AsyncConnectionPool(
            conninfo=db_uri,
            kwargs={"autocommit": True, "prepare_threshold": 0},
            open=False # Pool will be opened in worker_runner to ensure it happens in the async loop
        )
        checkpointer = AsyncPostgresSaver(pool)

        # Create agent
        logger.info("Creating deep agent instance...")
        _AGENT_COMPILED = create_deep_agent(
            model=init_chat_model(model="openai:gpt-5.4-nano", temperature=0),
            tools=[TavilySearch(max_results=5)],
            checkpointer=checkpointer,
        )
        
        return _AGENT_COMPILED
