"""Async worker: runs the agent and publishes events to Redis pub/sub."""

import logging

from src.agent import get_agent
from src.queue.redis_pubsub import publish_event
from utils.streaming import stream_agent_events

logger = logging.getLogger("backend")


async def run_agent_and_stream(request):
    """Run the agent end-to-end and publish each streamed event to Redis."""
    logger.info(
        "starting agent run: job_id=%s thread_id=%s",
        request.job_id,
        request.thread_id,
    )

    agent = get_agent()

    event_count = 0
    async for event in stream_agent_events(agent, request):
        await publish_event(request.job_id, event)
        event_count += 1

    logger.info("agent run complete: %d events published", event_count)
