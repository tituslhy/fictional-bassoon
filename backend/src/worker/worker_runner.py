"""Async worker: runs the agent and publishes events to Redis pub/sub."""

import logging
from psycopg_pool import AsyncConnectionPool
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
    
    # Ensure the checkpointer pool is open and setup is called
    checkpointer = agent.checkpointer
    # For AsyncPostgresSaver, the pool is typically stored in 'conn'
    conn = getattr(checkpointer, 'conn', None)
    
    if isinstance(conn, AsyncConnectionPool):
        # We only need to open the pool if it's not already open or opening.
        # AsyncConnectionPool.open() is idempotent if already open or returns immediately.
        try:
            # We open the pool to ensure it's ready.
            # In Celery's fork pool, each process will have its own lazy global 'agent'
            # and thus its own 'pool'.
            await conn.open()
            # setup() creates the checkpoint tables if they don't exist
            # This is also safe to call multiple times as it uses IF NOT EXISTS.
            await checkpointer.setup()
        except Exception as e:
            logger.debug("Error ensuring pool is open or during setup: %s", e)

    event_count = 0
    async for event in stream_agent_events(agent, request):
        await publish_event(request.job_id, event)
        event_count += 1

    logger.info("agent run complete: %d events published", event_count)
