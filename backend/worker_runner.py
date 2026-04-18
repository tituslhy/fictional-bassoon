"""Async worker: runs the agent and publishes events to Redis pub/sub."""

from agent import get_agent
from streaming import stream_agent_events
from redis_pubsub import publish_event

async def run_agent_and_stream(request):
    """Run the agent end-to-end and publish each streamed event to Redis."""
    agent = get_agent()

    async for event in stream_agent_events(agent, request):
        await publish_event(request.job_id, event)