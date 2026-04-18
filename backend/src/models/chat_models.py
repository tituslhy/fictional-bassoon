"""Request models for the streaming agent API."""

from pydantic import BaseModel, Field
import uuid


class ChatRequest(BaseModel):
    """Payload for the /chat SSE endpoint."""

    message: str = Field(..., min_length=1, max_length=10_000)
    thread_id: str = "default"
    job_id: str | None = None

    def with_job_id(self) -> "ChatRequest":
        """Return a copy with a generated job_id."""
        return self.model_copy(
            update={"job_id": self.job_id or str(uuid.uuid4())},
        )