"""Agent construction module.

Constructs the shared CompiledStateGraph at module level.
"""
import os
import logging

from deepagents import create_deep_agent
from langchain.chat_models import init_chat_model
from langchain_tavily import TavilySearch
from langgraph.graph.state import CompiledStateGraph
from dotenv import load_dotenv, find_dotenv

_ = load_dotenv(find_dotenv())

logger = logging.getLogger("backend")

# Import DB dependencies at module level
try:
    from langgraph.checkpoint.postgres import PostgresSaver
    from psycopg_pool import ConnectionPool
except ImportError as e:
    logger.error("Failed to import database dependencies: %s", e)
    raise RuntimeError("Database dependencies (psycopg, libpq) are required to run the agent.") from e

# Get DB URI at module level
db_uri = os.getenv("DB_URI")
if not db_uri:
    raise RuntimeError("DB_URI environment variable is not set")

# Initialize DB and checkpointer at module level
logger.info("Initializing Postgres checkpointer...")
pool = ConnectionPool(
    conninfo=db_uri,
    kwargs={"autocommit": True, "prepare_threshold": 0}
)
checkpointer = PostgresSaver(pool)
checkpointer.setup()

# Create agent at module level
logger.info("Creating deep agent instance...")
_AGENT_COMPILED: CompiledStateGraph = create_deep_agent(
    model=init_chat_model(model="openai:gpt-4.1-nano", temperature=0),
    tools=[TavilySearch(max_results=5)],
    checkpointer=checkpointer,
)

def get_agent() -> CompiledStateGraph:
    """Return the shared compiled deep agent."""
    return _AGENT_COMPILED