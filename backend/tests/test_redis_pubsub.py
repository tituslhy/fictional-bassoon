import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from src.queue.redis_pubsub import publish_event, subscribe

@pytest.mark.asyncio
async def test_publish_event():
    mock_redis = AsyncMock()
    # Mock the context manager
    with patch("src.queue.redis_pubsub.get_redis_connection") as mock_get_conn:
        mock_get_conn.return_value.__aenter__.return_value = mock_redis
        
        event = {"event": "test", "data": "info"}
        await publish_event("job1", event)
        
        mock_redis.publish.assert_called_once_with(
            "stream:job1", 
            json.dumps(event)
        )

@pytest.mark.asyncio
async def test_subscribe():
    with patch("src.queue.redis_pubsub.get_redis_client") as mock_get_client:
        mock_redis = MagicMock()
        mock_pubsub = MagicMock()
        mock_pubsub.subscribe = AsyncMock()
        
        mock_get_client.return_value = mock_redis
        mock_redis.pubsub.return_value = mock_pubsub
        
        result = await subscribe("job1")
        
        assert result == mock_pubsub
        mock_redis.pubsub.assert_called_once()
        mock_pubsub.subscribe.assert_called_once_with("stream:job1")
