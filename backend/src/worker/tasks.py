import asyncio
import logging
import threading
from collections.abc import Coroutine
from typing import Any
 
from src.celery_app import celery_app
from src.models.chat_models import ChatRequest
from src.worker.worker_runner import run_agent_and_stream
 
logger = logging.getLogger("backend")

def _run_coroutine_sync(coro: Coroutine[Any, Any, None]) -> None:
    """Run an async coroutine from Celery's synchronous task context."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(coro)
        return

    error: BaseException | None = None

    def runner() -> None:
        nonlocal error
        try:
            asyncio.run(coro)
        except BaseException as exc:
            error = exc

    thread = threading.Thread(target=runner, daemon=True)
    thread.start()
    thread.join()

    if error is not None:
        raise error
 
 
@celery_app.task(name="run_agent_task", soft_time_limit=300, time_limit=360)
def run_agent_task(request_dict: dict[str, Any]) -> None:
    """Celery entry-point to run the async agent loop.
 
    Args:
        request_dict: Dictionary to deserialize as ChatRequest.
 
    Returns:
        None
     """
    request = ChatRequest(**request_dict)
    logger.info("task received: job_id=%s thread_id=%s", request.job_id, request.thread_id)
    _run_coroutine_sync(run_agent_and_stream(request))