"""Redis pub/sub helpers for streaming agent events between worker and FastAPI."""

import json

import redis.asyncio as redis

r = redis.from_url("redis://localhost:6379")


async def publish_event(job_id: str, event: dict):
    """Publish a single SSE event dict to the ``stream:{job_id}`` channel."""
    await r.publish(f"stream:{job_id}", json.dumps(event))

async def subscribe(job_id: str):
    """Subscribe to the ``stream:{job_id}`` pub/sub channel and return the pub/sub object."""
    pubsub = r.pubsub()
    await pubsub.subscribe(f"stream:{job_id}")
    return pubsub