"""Redis pub/sub helpers for streaming agent events between worker and FastAPI."""

import json
import logging
import os
import redis.asyncio as redis
from contextlib import asynccontextmanager

logger = logging.getLogger("backend")

def get_redis_client():
    """Create a new Redis client for the current event loop."""
    return redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"))

@asynccontextmanager
async def get_redis_connection():
    """Context manager to get a Redis connection and ensure it is closed."""
    client = get_redis_client()
    try:
        yield client
    finally:
        await client.close()

async def publish_event(job_id: str, event: dict, client=None):
    """Publish a single SSE event dict to the ``stream:{job_id}`` channel.

    Args:
        job_id: The job ID to publish to.
        event: The event dictionary to publish.
        client: Optional Redis client. If not provided, a new one is created/closed.
    """
    channel = f"stream:{job_id}"

    if client:
        await client.publish(channel, json.dumps(event))
    else:
        async with get_redis_connection() as conn:
            await conn.publish(channel, json.dumps(event))

    logger.debug("published event to %s: %s", channel, event.get("event"))

async def subscribe(job_id: str):
    """Subscribe to the ``stream:{job_id}`` pub/sub channel and return the pub/sub object."""
    client = get_redis_client()
    pubsub = client.pubsub()
    channel = f"stream:{job_id}"
    await pubsub.subscribe(channel)
    logger.info("subscribed to %s", channel)
    return pubsub