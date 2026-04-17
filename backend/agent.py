"""Deep agent configuration for the application."""

from deepagents import create_deep_agent
from langchain.chat_models import init_chat_model
from langchain_tavily import TavilySearch
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()


def create_agent() -> object:
    """Create and return the Deep Agent instance.

    Returns:
        A configured deep agent with GPT-5.4-Nano and Tavily search.
    """
    return create_deep_agent(
        chat_model=init_chat_model(model="gpt-5.4-nano", temperature=0),
        tools=[TavilySearch(search_results=5)],
        checkpointer=checkpointer,
    )
