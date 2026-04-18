"""
Agent construction.

create_deep_agent returns a CompiledStateGraph directly — no wrapper needed.
"""

from deepagents import create_deep_agent
from langchain.chat_models import init_chat_model
from langchain_tavily import TavilySearch
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph.state import CompiledStateGraph

_checkpointer = InMemorySaver()

agent: CompiledStateGraph = create_deep_agent(
    model=init_chat_model(model="gpt-5.4-nano", temperature=0),
    tools=[TavilySearch(search_results=5)],
    checkpointer=_checkpointer,
)

def get_agent() -> CompiledStateGraph:
    """Return the shared compiled deep agent (GPT-5.4-Nano + TavilySearch)."""
    return agent