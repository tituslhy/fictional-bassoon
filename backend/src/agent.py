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
DB_URI = os.getenv("DB_URI")
connection_kwargs = {"autocommit": True, "prepare_threshold": 0}
connection_pool = ConnectionPool(conninfo=DB_URI, **connection_kwargs)
checkpointer = PostgresSaver(connection_pool)
checkpointer.setup()

def get_agent():
    """Return the shared compiled deep agent."""
    # Pass the already-initialized checkpointer
    agent: CompiledStateGraph = create_deep_agent(
        model=init_chat_model(model="openai:gpt-5.4-nano", temperature=0),
        tools=[TavilySearch(search_results=5)],
        checkpointer=checkpointer,
    )
    return agent
