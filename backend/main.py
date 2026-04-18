"""FastAPI application with SSE chat and health endpoints."""

import json
import logging

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.sse import EventSourceResponse, ServerSentEvent
from logging.config import fileConfig

from pathlib import Path

# Configure logging from INI file
LOGGING_CONFIG_PATH = Path(__file__).parent / "logging.ini"
fileConfig(LOGGING_CONFIG_PATH, disable_existing_loggers=False)
logger = logging.getLogger("backend")

from src.models.chat_models import ChatRequest
from src.queue.redis_pubsub import subscribe
from src.worker.tasks import run_agent_task

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
    request = request.with_job_id()

    logger.info("received chat request for job_id=%s", request.job_id)

    pubsub = await subscribe(request.job_id)
    
    # 🚀 enqueue → RabbitMQ via Celery
    run_agent_task.delay(request.model_dump())

    async def event_generator():
        """Generator that yields ServerSentEvent objects from Redis pub/sub."""

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


if __name__ == "__main__":
    logger.info("starting uvicorn on 0.0.0.0:8000")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
    )
