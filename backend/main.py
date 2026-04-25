"""FastAPI application with SSE chat and health endpoints."""

import json
import logging
from pathlib import Path
from logging.config import fileConfig
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.sse import EventSourceResponse, ServerSentEvent
from prometheus_fastapi_instrumentator import Instrumentator

from src.models.chat_models import ChatRequest, HealthResponse
from src.models.auth_models import SignupRequest, LoginRequest, TokenResponse
from src.queue.redis_pubsub import subscribe, redis_client
from src.worker.tasks import run_agent_task
from src.auth import hash_password, verify_password, create_access_token
from src.db import get_db_pool, close_db_pool

# Configure logging from INI file
LOGGING_CONFIG_PATH = Path(__file__).parent / "logging.ini"
fileConfig(LOGGING_CONFIG_PATH, disable_existing_loggers=False)
logger = logging.getLogger("backend")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize pool on startup
    await get_db_pool()
    yield
    # Close pool on shutdown
    await close_db_pool()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instrument FastAPI with Prometheus
Instrumentator().instrument(app).expose(app)


@app.post("/auth/signup", response_model=TokenResponse)
async def signup(request: SignupRequest):
    """Create a new user account."""
    pool = await get_db_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            # Check if user exists
            await cur.execute("SELECT id FROM api.users WHERE email = %s", (request.email,))
            if await cur.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered"
                )
            
            # Insert user
            hashed = hash_password(request.password)
            await cur.execute(
                "INSERT INTO api.users (email, password_hash, full_name) VALUES (%s, %s, %s) RETURNING id",
                (request.email, hashed, request.full_name)
            )
            user_row = await cur.fetchone()
            user_id = str(user_row[0])
            
            # Return token immediately after signup
            token = create_access_token(data={"user_id": user_id, "email": request.email})
            return TokenResponse(access_token=token)


@app.post("/auth/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """Authenticate user and return JWT."""
    pool = await get_db_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT id, password_hash FROM api.users WHERE email = %s",
                (request.email,)
            )
            row = await cur.fetchone()
            if not row or not verify_password(request.password, row[1]):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password"
                )
            
            user_id = str(row[0])
            token = create_access_token(data={"user_id": user_id, "email": request.email})
            return TokenResponse(access_token=token)


@app.post("/chat", response_class=EventSourceResponse)
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

            # Use ServerSentEvent with raw_data to maintain exact string parity
            # with the previous implementation (avoiding double JSON encoding).
            yield ServerSentEvent(raw_data=data_payload, event=event_type)

            if event_type == "done":
                break

    finally:
        await pubsub.unsubscribe(f"stream:{job_id}")
        await pubsub.close()


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health check endpoint with Redis connectivity check."""
    try:
        await redis_client.ping()
        return HealthResponse(status="ok", redis="connected")
    except Exception as e:
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
