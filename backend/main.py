"""
FastAPI backend with streaming Deep Agent endpoint.

Streams all token types (reasoning, tool calls, tool results, answer)
as Server-Sent Events using FastAPI's native EventSourceResponse and ServerSentEvent.
"""

from collections.abc import AsyncIterable

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.sse import EventSourceResponse, ServerSentEvent

from agent import get_agent
from models import ChatRequest
from streaming import stream_agent_events

from dotenv import load_dotenv, find_dotenv

_ = load_dotenv(find_dotenv())

app = FastAPI(title="Deep Agent API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/chat", response_class=EventSourceResponse)
async def chat(request: ChatRequest) -> AsyncIterable[ServerSentEvent]:
    """Stream agent reasoning, tool calls, and final answer as SSE."""
    agent = get_agent()
    async for event in stream_agent_events(agent, request):
        yield event


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}