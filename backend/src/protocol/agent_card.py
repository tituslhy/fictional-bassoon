"""Builds this backend's A2A Agent Card.

Schema: ``a2a.types.a2a_pb2.AgentCard`` from the pinned ``a2a-sdk[fastapi]==1.1.2``
(protocol version 1.0 — see ``.claude/rules/protocol-version-pinning.md`` for the
verification notes on the v0.3 -> v1.0 schema/method-name changes).

Keep this honest: the agent behind this card is a single ``deepagents``
Deep Agent (``src/agent.py``) with exactly one tool, Tavily web search — see
``.claude/rules/deep-agent-scope-lock.md``. Do not advertise capabilities
(push notifications, multi-turn task push config, extended card, etc.) that
aren't actually wired up.
"""

import os

from a2a.types.a2a_pb2 import (
    AgentCapabilities,
    AgentCard,
    AgentInterface,
    AgentSkill,
)
from a2a.utils.constants import PROTOCOL_VERSION_1_0, TransportProtocol

RPC_URL_PATH = "/a2a"


def _base_url() -> str:
    """Public base URL this backend is reachable at.

    No existing env var covers this (the rest of the app is only ever
    addressed via ``NEXT_PUBLIC_API_URL`` from the frontend side). Defaults
    to the documented local FastAPI port from ``CLAUDE.md``.
    """
    return os.getenv("A2A_BASE_URL", "http://localhost:8000").rstrip("/")


def build_agent_card() -> AgentCard:
    """Construct the Agent Card describing exactly what this backend can do.

    Two skills, matching the two things the Deep Agent actually does:
    holding a conversation, and answering questions that need current
    information via Tavily search. Nothing else — no memory, no file tools,
    no multi-agent handoff, no push notifications.
    """
    base_url = _base_url()

    capabilities = AgentCapabilities(
        streaming=True,
        push_notifications=False,
        extended_agent_card=False,
    )

    chat_skill = AgentSkill(
        id="chat",
        name="Conversational chat",
        description=(
            "Holds a multi-turn conversation, using LangGraph checkpointing "
            "keyed by the A2A contextId (mapped 1:1 onto this backend's "
            "existing thread_id) to keep context across turns."
        ),
        tags=["chat", "conversation"],
        examples=["Summarize the last thing I asked you about."],
        input_modes=["text/plain"],
        output_modes=["text/plain"],
    )

    web_search_skill = AgentSkill(
        id="web_search",
        name="Web search (Tavily)",
        description=(
            "When a question needs current information, the agent "
            "autonomously calls its one configured tool, Tavily web "
            "search (max 5 results), and answers using the results."
        ),
        tags=["search", "web", "tavily"],
        examples=["What's the latest release version of FastAPI?"],
        input_modes=["text/plain"],
        output_modes=["text/plain"],
    )

    return AgentCard(
        name="fictional-bassoon-chat-agent",
        description=(
            "Chat agent backed by a LangGraph Deep Agent with a single "
            "Tavily web-search tool. Exposes the existing Celery/Redis "
            "streaming chat pipeline over the A2A protocol."
        ),
        version="0.1.0",
        supported_interfaces=[
            AgentInterface(
                url=f"{base_url}{RPC_URL_PATH}",
                protocol_binding=TransportProtocol.JSONRPC.value,
                protocol_version=PROTOCOL_VERSION_1_0,
            )
        ],
        capabilities=capabilities,
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        skills=[chat_skill, web_search_skill],
    )
