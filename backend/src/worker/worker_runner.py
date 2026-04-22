"""Async worker: runs the agent and publishes events to Redis pub/sub."""

import logging
from psycopg_pool import AsyncConnectionPool
from src.agent import get_agent
from src.queue.redis_pubsub import publish_event, get_redis_connection
from utils.streaming import stream_agent_events

logger = logging.getLogger("backend")


async def run_agent_and_stream(request):
    """Run the agent end-to-end and publish each streamed event to Redis."""
    logger.info(
        "starting agent run: job_id=%s thread_id=%s",
        request.job_id,
        request.thread_id,
    )

    agent = None
    conn = None

    try:
        # get_agent() now returns a fresh agent with its own checkpointer and pool.
        # This is critical for Celery workers to avoid 'Event loop is closed' errors.
        agent = await get_agent()

        # For AsyncPostgresSaver, the pool is typically stored in 'conn'
        checkpointer = agent.checkpointer
        conn = getattr(checkpointer, 'conn', None)

        # Use a fresh Redis connection for this task's event loop.
        async with get_redis_connection() as redis:
            event_count = 0
            async for event in stream_agent_events(agent, request):
                await publish_event(request.job_id, event, client=redis)
                event_count += 1

            logger.info("agent run complete: %d events published", event_count)

    except Exception as e:
        logger.error("Error during agent setup or streaming: %s", e)
        # Publish terminal error and done events
        async with get_redis_connection() as redis:
            await publish_event(request.job_id, {"event": "error", "data": str(e) or type(e).__name__}, client=redis)
            await publish_event(request.job_id, {"event": "done", "data": ""}, client=redis)
        raise

    finally:
        # Crucial: Close the pool at the end of the task to release resources
        # and avoid loop binding issues in subsequent tasks.
        if isinstance(conn, AsyncConnectionPool):
            try:
                await conn.close()
                logger.info("checkpointer pool closed")
            except Exception as e:
                logger.warning("Error closing checkpointer pool: %s", e)