import pytest
import json
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock
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
    class MockPubSub:
        async def listen(self):
            yield {"type": "message", "data": json.dumps({"event": "answer", "data": "hello"})}
            yield {"type": "message", "data": json.dumps({"event": "done", "data": ""})}
        
        async def unsubscribe(self, channel):
            pass
            
        async def close(self):
            pass

    mock_pubsub = MockPubSub()

    with patch("main.subscribe", return_value=mock_pubsub) as mock_sub, \
         patch("main.run_agent_task.delay") as mock_delay:
        
        payload = {"message": "hi", "thread_id": "t1"}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/chat", json=payload)
            
        assert response.status_code == 200
        # Check stream content
        content = response.text
        assert "event: answer" in content
        assert "data: hello" in content
        assert "event: done" in content
        
        mock_sub.assert_called_once()
        mock_delay.assert_called_once()
