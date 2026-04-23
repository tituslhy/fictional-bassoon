"""FastAPI application with SSE chat and health endpoints."""

import json
import logging
from pathlib import Path
from logging.config import fileConfig

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from prometheus_fastapi_instrumentator import Instrumentator
from redis.exceptions import RedisError

from src.models.chat_models import ChatRequest, HealthResponse
from src.queue.redis_pubsub import subscribe, redis_client
from src.worker.tasks import run_agent_task

# Configure logging from INI file
LOGGING_CONFIG_PATH = Path(__file__).parent / "logging.ini"
fileConfig(LOGGING_CONFIG_PATH, disable_existing_loggers=False)
logger = logging.getLogger("backend")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instrument FastAPI with Prometheus
Instrumentator().instrument(app).expose(app)


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
                event_type = event.pop('event', 'message')
                
                # If there are extra fields (like tool_call_id), or if the event
                # is complex, we send the remaining event dict as a JSON string.
                # For simple events with just 'data', we send just the data string.
                if len(event) == 1 and 'data' in event and isinstance(event['data'], str):
                    data_payload = event['data']
                else:
                    data_payload = json.dumps(event)

                # Format as SSE:
                # event: <type>
                # data: <content> (split multiline content across multiple data: lines)
                # <blank line>
                
                # Split data content on newlines and emit each line prefixed with "data: "
                data_lines = data_payload.split('\n')
                sse_output = f"event: {event_type}\n"
                for line in data_lines:
                    sse_output += f"data: {line}\n"
                sse_output += "\n"

                yield sse_output

                if event_type == "done":
                    break

        finally:
            await pubsub.unsubscribe(f"stream:{job_id}")
            await pubsub.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health check endpoint with Redis connectivity check."""
    try:
        await redis_client.ping()
        return HealthResponse(status="ok", redis="connected")
    except RedisError as e:
        logger.error("Redis health check failed: %s", e)
        return HealthResponse(status="error", redis="disconnected")


if __name__ == "__main__":
    logger.info("starting uvicorn on 0.0.0.0:8000")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
    )