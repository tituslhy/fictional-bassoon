import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.mark.asyncio
async def test_health_check_ok():
    with patch("main.redis_client") as mock_redis:
        mock_redis.ping = AsyncMock()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok", "redis": "connected"}


@pytest.mark.asyncio
async def test_health_check_redis_error():
    with patch("main.redis_client") as mock_redis:
        mock_redis.ping.side_effect = Exception("Redis down")

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "error", "redis": "disconnected"}


@pytest.mark.asyncio
async def test_chat_endpoint_success():
    # Use a real class for the mock to avoid MagicMock magic interference with generators
    text_content_data = json.dumps(
        {"type": "TEXT_MESSAGE_CONTENT", "messageId": "m1", "delta": "hello"}
    )
    run_finished_data = json.dumps({"type": "RUN_FINISHED", "threadId": "t1", "runId": "j1"})

    class MockPubSub:
        async def listen(self):
            yield {
                "type": "message",
                "data": json.dumps({"event": "TEXT_MESSAGE_CONTENT", "data": text_content_data}),
            }
            yield {
                "type": "message",
                "data": json.dumps({"event": "RUN_FINISHED", "data": run_finished_data}),
            }

        async def unsubscribe(self, channel):
            pass

        async def close(self):
            pass

    mock_pubsub = MockPubSub()

    with (
        patch("main.subscribe", return_value=mock_pubsub) as mock_sub,
        patch("main.run_agent_task.delay") as mock_delay,
    ):
        payload = {"message": "hi", "thread_id": "t1"}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/chat", json=payload)

        assert response.status_code == 200
        # Check stream content
        content = response.text
        assert "event: TEXT_MESSAGE_CONTENT" in content
        assert text_content_data in content
        assert "event: RUN_FINISHED" in content

        mock_sub.assert_called_once()
        mock_delay.assert_called_once()
