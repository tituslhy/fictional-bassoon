"""FastAPI application entry point."""

from collections.abc import AsyncIterable
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import BaseModel

from agent import create_agent
from streaming import stream_agent_response


class ChatRequest(BaseModel):
    query: str
    conv_id: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the agent on startup and clean up on shutdown."""
    agent = create_agent()
    yield {"agent": agent}


app = FastAPI(title="Deep Agent", lifespan=lifespan)


@app.post("/ask", response_class=EventSourceResponse)
async def ask(req: ChatRequest) -> AsyncIterable[ServerSentEvent]:
    """Stream the agent's response via Server-Sent Events."""
    agent = app.state.agent
    config = {"configurable": {"thread_id": req.conv_id}}
    return stream_agent_response(agent, req.query, config)


@app.get("/health")
async def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
