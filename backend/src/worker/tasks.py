"""Celery task that bridges a sync worker to the async agent runner."""

import asyncio
import logging

from src.celery_app import celery_app
from src.models.chat_models import ChatRequest
from src.worker.worker_runner import run_agent_and_stream

logger = logging.getLogger("backend")


@celery_app.task(name="run_agent_task", soft_time_limit=300, time_limit=360)
def run_agent_task(request_dict):
    """Celery entry-point: deserialise the request and run the async agent loop.

    Handles the edge-case of being invoked from a running event loop
    (rare, e.g. gevent) by creating an isolated loop.
    """
    request = ChatRequest(**request_dict)
    logger.info("task received: job_id=%s thread_id=%s", request.job_id, request.thread_id)

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        logger.debug("already in event loop, using new loop")
        new_loop = asyncio.new_event_loop()
        try:
            new_loop.run_until_complete(run_agent_and_stream(request))
        finally:
            new_loop.close()
    else:
        asyncio.run(run_agent_and_stream(request))
