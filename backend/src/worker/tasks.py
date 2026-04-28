"""Celery tasks for the agent worker."""

import asyncio
import logging
from typing import Any, Coroutine, Dict

from src.celery_app import celery_app
from src.models.chat_models import ChatRequest
from src.worker.worker_runner import run_agent_and_stream

logger = logging.getLogger("backend")

def _run_coroutine_sync(coro: Coroutine[Any, Any, None]) -> None:
    """Run an async coroutine from Celery's synchronous task context."""
    try:
        asyncio.get_running_loop()
        # If there is a loop, we create a new one to avoid conflict
        # This is common in tests or specific worker setups
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(coro)
        finally:
            loop.close()
    except RuntimeError:
        # No running loop, safe to use asyncio.run
        asyncio.run(coro)

@celery_app.task(name="run_agent_task", soft_time_limit=300, time_limit=360)
def run_agent_task(request_dict: Dict[str, Any]) -> None:
    """Celery entry-point to run the async agent loop.

    Args:
        request_dict: Dictionary to deserialize as ChatRequest.

    Returns:
        None
    """
    logger.info("Task received: %s", request_dict)
    try:
        request = ChatRequest(**request_dict)
        _run_coroutine_sync(run_agent_and_stream(request))
    except Exception as e:
        logger.error("Error running agent task: %s", e, exc_info=True)
