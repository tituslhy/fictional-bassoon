"""Request and response models."""

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., description="User message to the agent")
    thread_id: str = Field(default="default", description="Conversation thread ID for memory")