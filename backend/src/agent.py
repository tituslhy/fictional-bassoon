"""
Agent construction.

create_deep_agent returns a CompiledStateGraph directly — no wrapper needed.
"""
import os
import logging

from deepagents import create_deep_agent
from langchain.chat_models import init_chat_model
from langchain_tavily import TavilySearch
from langgraph.graph.state import CompiledStateGraph

from dotenv import load_dotenv, find_dotenv

from langgraph.checkpoint.postgres import PostgresSaver
from psycopg_pool import ConnectionPool

_ = load_dotenv(find_dotenv())

logger = logging.getLogger("backend")
_checkpointer: PostgresSaver | None = None
_agent: CompiledStateGraph | None = None


def _get_checkpointer() -> PostgresSaver:
    global _checkpointer
    if _checkpointer is None:
        db_uri = os.getenv("DB_URI")
        if not db_uri:
            raise RuntimeError("DB_URI environment variable is not set")
        pool = ConnectionPool(
            conninfo=db_uri, kwargs={"autocommit": True, "prepare_threshold": 0}
        )
        cp = PostgresSaver(pool)
        cp.setup()
        _checkpointer = cp
    return _checkpointer


def get_agent() -> CompiledStateGraph:
    """Return the shared compiled deep agent (memoized)."""
    global _agent
    if _agent is None:
        _agent = create_deep_agent(
            model=init_chat_model(model="openai:gpt-4.1-nano", temperature=0),
            tools=[TavilySearch(search_results=5)],
            checkpointer=_get_checkpointer(),
        )
    return _agent