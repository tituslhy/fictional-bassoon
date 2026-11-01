"""Authenticated thread catalog request/response shapes."""

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class ThreadCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID = Field(default_factory=uuid4)
    title: str = Field(default="New chat", min_length=1, max_length=500)


class ThreadUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=500)


class ThreadSummary(BaseModel):
    id: UUID
    title: str
    updated_at: datetime
