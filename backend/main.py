"""FastAPI application with SSE chat and health endpoints."""

import json
import logging

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from logging.config import fileConfig

from pathlib import Path

# Configure logging from INI file
LOGGING_CONFIG_PATH = Path(__file__).parent / "logging.ini"
fileConfig(LOGGING_CONFIG_PATH, disable_existing_loggers=False)
logger = logging.getLogger("backend")

from src.models.chat_models import ChatRequest
from src.queue.redis_pubsub import subscribe, redis_client
from src.worker.tasks import run_agent_task

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/chat")
async def chat(request: ChatRequest):
    """Stream agent events via SSE.

    Enqueues a Celery task to run the agent, then subscribes to the
    corresponding Redis pub/sub channel and yields events to the client
    until the agent signals done.
    """
    # Ensure job_id is present
    request = request.with_job_id()
    job_id = request.job_id
    
    logger.info("received chat request for job_id=%s thread_id=%s", job_id, request.thread_id)

    pubsub = await subscribe(job_id)

    try:
        run_agent_task.delay(request.model_dump())
    except Exception:
        await pubsub.unsubscribe(f"stream:{job_id}")
        await pubsub.close()
        logger.exception("failed to enqueue chat task: job_id=%s", job_id)
        raise

    async def event_generator():
        """Generator that yields SSE formatted strings from Redis pub/sub."""

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue

                event = json.loads(message["data"])
                
                # Format as SSE:
                # event: <type>
                # data: <content>
                # <blank line>
                yield f"event: {event['event']}\ndata: {event['data']}\n\n"

                if event["event"] == "done":
                    break

        finally:
            await pubsub.unsubscribe(f"stream:{job_id}")
            await pubsub.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/health")
async def health():
    """Health check endpoint with Redis connectivity check."""
    health_status = {"status": "ok", "redis": "connected"}
    try:
        await redis_client.ping()
    except Exception as e:
        logger.error("Redis health check failed: %s", e)
        health_status["status"] = "error"
        health_status["redis"] = "disconnected"
    return health_status


if __name__ == "__main__":
    logger.info("starting uvicorn on 0.0.0.0:8000")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
    )
