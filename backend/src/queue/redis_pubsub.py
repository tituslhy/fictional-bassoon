"""Redis pub/sub helpers for streaming agent events between worker and FastAPI."""

import json
import logging
import os

import redis.asyncio as redis

logger = logging.getLogger("backend")

redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"))


async def publish_event(job_id: str, event: dict):
    """Publish a single SSE event dict to the ``stream:{job_id}`` channel."""
    channel = f"stream:{job_id}"
    await redis_client.publish(channel, json.dumps(event))
    logger.debug("published event to %s: %s", channel, event.get("event"))


async def subscribe(job_id: str):
    """Subscribe to the ``stream:{job_id}`` pub/sub channel and return the pub/sub object."""
    pubsub = redis_client.pubsub()
    channel = f"stream:{job_id}"
    await pubsub.subscribe(channel)
    logger.info("subscribed to %s", channel)
    return pubsub
