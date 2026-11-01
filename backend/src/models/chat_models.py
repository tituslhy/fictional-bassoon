"""Request/response models for the streaming agent API.

Pydantic shapes only — mapping from checkpoint messages lives in
``src/history.py``, not here.
"""

import json
import uuid
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


class ChatRequest(BaseModel):
    """Payload for the /chat SSE endpoint."""

    message: str = Field(..., min_length=1, max_length=10_000)
    thread_id: str = "default"
    job_id: str | None = None
    a2ui_action: dict[str, Any] | None = None

    @field_validator("a2ui_action")
    @classmethod
    def bounded_action(cls, value):
        if value is not None and len(json.dumps(value)) > 4000:
            raise ValueError("UI action is too large")
        return value

    def with_job_id(self) -> "ChatRequest":
        """Return a copy with a generated job_id."""
        return self.model_copy(
            update={"job_id": self.job_id or str(uuid.uuid4())},
        )


class HealthResponse(BaseModel):
    """Response model for the /health endpoint."""

    status: Literal["ok", "error"]
    redis: Literal["connected", "disconnected"]


class HistoryToolCall(BaseModel):
    """One tool invocation on a hydrated assistant turn (camelCase on the wire)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    name: str
    args: str = ""
    result: str | None = None
    expanded: bool = False
    tracking_key: str | None = None
    index: int | None = None


class HistoryMessage(BaseModel):
    """One turn of ``GET /threads/{thread_id}/history``.

    Matches ``frontend/src/types/index.ts`` ``ThreadMessage`` (camelCase
    ``toolCalls``). Optional ``a2ui`` is omitted on hydrate — the frontend
    builds the 4-type tree via ``buildLegacyStreamTree``.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    role: Literal["user", "assistant"]
    content: str = ""
    reasoning: str | None = None
    tool_calls: list[HistoryToolCall] = Field(default_factory=list)
    status: Literal["streaming", "done", "error"] = "done"
    error: str | None = None
    a2ui: dict[str, Any] | None = None
    a2ui_surfaces: list[dict[str, Any]] = Field(default_factory=list, alias="a2uiSurfaces")
    a2ui_action: dict[str, Any] | None = Field(default=None, alias="a2uiAction")


class HistoryResponse(BaseModel):
    """Body of ``GET /threads/{thread_id}/history``."""

    messages: list[HistoryMessage] = Field(default_factory=list)
