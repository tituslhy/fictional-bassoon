import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.queue.redis_pubsub import get_redis_client, publish_event, subscribe


@pytest.mark.asyncio
async def test_publish_event():
    mock_redis = AsyncMock()
    with patch("src.queue.redis_pubsub.get_redis_connection") as mock_get_conn:
        mock_get_conn.return_value.__aenter__.return_value = mock_redis

        event = {"event": "test", "data": "info"}
        await publish_event("job1", event)

        mock_redis.publish.assert_called_once_with("stream:job1", json.dumps(event))


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


def test_get_redis_client_uses_url():
    mock_client = MagicMock()
    with (
        patch.dict("os.environ", {"REDIS_URL": "redis://redis:6379"}, clear=True),
        patch("src.queue.redis_pubsub.redis.from_url", return_value=mock_client) as mock_from_url,
    ):
        client = get_redis_client()

    assert client == mock_client
    mock_from_url.assert_called_once_with("redis://redis:6379")


@pytest.mark.asyncio
async def test_get_redis_connection_closes_client():
    mock_client = AsyncMock()
    with patch("src.queue.redis_pubsub.get_redis_client", return_value=mock_client):
        from src.queue.redis_pubsub import get_redis_connection

        async with get_redis_connection() as conn:
            assert conn is mock_client
        mock_client.close.assert_awaited_once()


def test_get_redis_client_defaults_to_localhost():
    mock_client = MagicMock()
    with (
        patch.dict("os.environ", {}, clear=True),
        patch("src.queue.redis_pubsub.redis.from_url", return_value=mock_client) as mock_from_url,
    ):
        client = get_redis_client()

    assert client == mock_client
    mock_from_url.assert_called_once_with("redis://localhost:6379")
