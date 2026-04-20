import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from src.queue.redis_pubsub import publish_event, subscribe

@pytest.mark.asyncio
async def test_publish_event():
    with patch("src.queue.redis_pubsub.redis_client", new_callable=MagicMock) as mock_redis:
        mock_redis.publish = AsyncMock()
        
        event = {"event": "test", "data": "info"}
        await publish_event("job1", event)
        
        mock_redis.publish.assert_called_once_with(
            "stream:job1", 
            json.dumps(event)
        )

@pytest.mark.asyncio
async def test_subscribe():
    with patch("src.queue.redis_pubsub.redis_client", new_callable=MagicMock) as mock_redis:
        mock_pubsub = MagicMock()
        mock_pubsub.subscribe = AsyncMock()
        # redis_client.pubsub() is a sync call returning the pubsub object
        mock_redis.pubsub.return_value = mock_pubsub
        
        result = await subscribe("job1")
        
        assert result == mock_pubsub
        mock_redis.pubsub.assert_called_once()
        mock_pubsub.subscribe.assert_called_once_with("stream:job1")
