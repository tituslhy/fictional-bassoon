"""Redis pub/sub helpers for streaming agent events between worker and FastAPI."""

import json
import logging
import os
from contextlib import asynccontextmanager

import redis.asyncio as redis  # type: ignore[import-untyped]
from redis.asyncio.sentinel import Sentinel  # type: ignore[import-untyped]

logger = logging.getLogger("backend")


def _get_sentinel_nodes():
    nodes = os.getenv("APP_REDIS_SENTINEL_NODES", "").strip()
    if not nodes:
        return []

    parsed_nodes = []
    for node in nodes.split(","):
        host, port = node.strip().split(":", 1)
        parsed_nodes.append((host, int(port)))
    return parsed_nodes


def get_redis_client():
    """Create a new Redis client for the current event loop."""
    sentinel_nodes = _get_sentinel_nodes()
    if sentinel_nodes:
        sentinel_master = os.getenv("APP_REDIS_SENTINEL_MASTER", "app-redis")
        redis_db = int(os.getenv("APP_REDIS_DB", "0"))
        redis_password = os.getenv("APP_REDIS_PASSWORD")
        sentinel_password = os.getenv("APP_REDIS_SENTINEL_PASSWORD")

        sentinel = Sentinel(
            sentinel_nodes,
            sentinel_kwargs={"password": sentinel_password} if sentinel_password else None,
        )
        return sentinel.master_for(
            sentinel_master,
            db=redis_db,
            password=redis_password,
        )

    return redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"))


# Global redis client for health checks and general use
redis_client = get_redis_client()


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
