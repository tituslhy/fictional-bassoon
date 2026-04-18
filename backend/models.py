"""Request models for the streaming agent API."""

from pydantic import BaseModel, Field
import uuid


class ChatRequest(BaseModel):
    """Payload for the /chat SSE endpoint."""

    message: str = Field(...)
    thread_id: str = "default"
    job_id: str | None = None

    def ensure_job_id(self):
        """Generate a job_id if one was not provided."""
        self.job_id = self.job_id or str(uuid.uuid4())
        return self