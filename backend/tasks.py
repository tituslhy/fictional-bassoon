"""Celery task that bridges a sync worker to the async agent runner."""

import asyncio

from celery_app import celery_app
from models import ChatRequest
from worker_runner import run_agent_and_stream


@celery_app.task(name="run_agent_task")
def run_agent_task(request_dict):
    """Celery entry-point: deserialise the request and run the async agent loop.

    Handles the edge-case of being invoked from a running event loop
    (rare, e.g. gevent) by creating an isolated loop.
    """
    request = ChatRequest(**request_dict)

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # Rare case: already inside event loop (e.g. gevent weirdness)
        # fallback: create isolated loop
        new_loop = asyncio.new_event_loop()
        try:
            new_loop.run_until_complete(run_agent_and_stream(request))
        finally:
            new_loop.close()
    else:
        asyncio.run(run_agent_and_stream(request))