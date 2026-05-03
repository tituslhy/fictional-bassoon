import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from src.queue.redis_pubsub import publish_event, subscribe, get_redis_client, _get_sentinel_nodes

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


def test_get_sentinel_nodes_empty():
    with patch.dict("os.environ", {}, clear=True):
        assert _get_sentinel_nodes() == []


def test_get_sentinel_nodes_parses_hosts():
    with patch.dict(
        "os.environ",
        {"APP_REDIS_SENTINEL_NODES": "sentinel-1:26379,sentinel-2:26380"},
        clear=True,
    ):
        assert _get_sentinel_nodes() == [("sentinel-1", 26379), ("sentinel-2", 26380)]


def test_get_redis_client_uses_sentinel():
    mock_sentinel = MagicMock()
    mock_client = MagicMock()
    mock_sentinel.master_for.return_value = mock_client

    with patch.dict(
        "os.environ",
        {
            "APP_REDIS_SENTINEL_NODES": "sentinel-1:26379,sentinel-2:26379",
            "APP_REDIS_SENTINEL_MASTER": "app-redis",
            "APP_REDIS_DB": "3",
            "APP_REDIS_PASSWORD": "redis-pass",
            "APP_REDIS_SENTINEL_PASSWORD": "sentinel-pass",
        },
        clear=True,
    ), patch("src.queue.redis_pubsub.Sentinel", return_value=mock_sentinel):
        client = get_redis_client()

    assert client == mock_client
    mock_sentinel.master_for.assert_called_once_with(
        "app-redis",
        db=3,
        password="redis-pass",
    )


def test_get_redis_client_falls_back_to_url():
    mock_client = MagicMock()
    with patch.dict("os.environ", {"REDIS_URL": "redis://redis:6379"}, clear=True), patch(
        "src.queue.redis_pubsub.redis.from_url", return_value=mock_client
    ) as mock_from_url:
        client = get_redis_client()

    assert client == mock_client
    mock_from_url.assert_called_once_with("redis://redis:6379")
