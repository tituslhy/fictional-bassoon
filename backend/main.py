"""FastAPI application with SSE chat and health endpoints."""

import json

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.sse import EventSourceResponse, ServerSentEvent

from models import ChatRequest
from redis_pubsub import subscribe
from tasks import run_agent_task

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/chat", response_class=EventSourceResponse)
async def chat(request: ChatRequest):
    """Stream agent events via SSE.

    Enqueues a Celery task to run the agent, then subscribes to the
    corresponding Redis pub/sub channel and yields events to the client
    until the agent signals done.
    """
    request = request.ensure_job_id()

    # 🚀 enqueue → RabbitMQ via Celery
    run_agent_task.delay(request.dict())

    async def event_generator():
        """Generator that yields ServerSentEvent objects from Redis pub/sub."""
        pubsub = await subscribe(request.job_id)

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue

                event = json.loads(message["data"])

                yield ServerSentEvent(
                    data=event["data"],
                    event=event["event"],
                )

                if event["event"] == "done":
                    break

        finally:
            await pubsub.unsubscribe(f"stream:{request.job_id}")
            await pubsub.close()

    return EventSourceResponse(event_generator())


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}