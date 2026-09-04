"""A2A JSON-RPC + Agent Card router, mountable on the existing FastAPI app.

Per ``.claude/rules/container-budget.md``, this is a router mount on the
existing ``backend`` FastAPI service — not a new container/service.

Uses the pinned ``a2a-sdk[fastapi]==1.1.2``'s own route builders
(``create_agent_card_routes`` / ``create_jsonrpc_routes``) rather than
hand-rolling JSON-RPC dispatch, so the JSON-RPC 2.0 envelope, error codes,
and SSE streaming format stay spec-compliant without re-deriving them from
memory (see ``.claude/skills/protocol-spec-verification/SKILL.md``).
"""

from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes.agent_card_routes import create_agent_card_routes
from a2a.server.routes.jsonrpc_routes import create_jsonrpc_routes
from fastapi import APIRouter

from src.protocol.agent_card import RPC_URL_PATH, build_agent_card
from src.protocol.executor import ChatAgentExecutor
from src.protocol.task_store import get_task_store


def build_a2a_router() -> APIRouter:
    """Build the APIRouter exposing the Agent Card and JSON-RPC endpoints.

    Task state lives in Postgres (``a2a_tasks``) via the SDK's
    ``DatabaseTaskStore`` when ``DB_URI`` is set, so ``GetTask`` / ``ListTasks``
    survive restarts and work across backend replicas. Falls back to
    ``InMemoryTaskStore`` only when ``DB_URI`` is unset (unit tests).
    """
    agent_card = build_agent_card()
    request_handler = DefaultRequestHandler(
        agent_executor=ChatAgentExecutor(),
        task_store=get_task_store(),
        agent_card=agent_card,
    )

    router = APIRouter()
    router.routes.extend(create_agent_card_routes(agent_card))
    router.routes.extend(create_jsonrpc_routes(request_handler, rpc_url=RPC_URL_PATH))
    return router
