from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.models.chat_models import ChatRequest
from src.worker.worker_runner import run_agent_and_stream


@pytest.mark.asyncio
async def test_run_agent_and_stream_agent_failure():
    request = ChatRequest(message="test", thread_id="t1", job_id="j1")

    # Mock redis context manager
    mock_redis = AsyncMock()
    mock_cm = MagicMock()
    mock_cm.__aenter__.return_value = mock_redis
    mock_cm.__aexit__ = AsyncMock()

    with (
        patch("src.worker.worker_runner.get_agent", side_effect=Exception("DB connection failed")),
        patch("src.worker.worker_runner.get_redis_connection", return_value=mock_cm),
        patch("src.worker.worker_runner.publish_event", new_callable=AsyncMock) as mock_publish,
    ):
        # We wrap in try/except because run_agent_and_stream re-raises
        try:
            await run_agent_and_stream(request)
        except Exception as e:
            assert str(e) == "DB connection failed"

        # Check that a single terminal RUN_ERROR event was published (AG-UI
        # vocabulary — see ag_ui.core.events.RunErrorEvent)
        assert mock_publish.call_count == 1
        call_args = mock_publish.call_args
        assert call_args.args[0] == "j1"
        published_event = call_args.args[1]
        assert published_event["event"] == "RUN_ERROR"
        assert call_args.kwargs["client"] is mock_redis

        import json

        payload = json.loads(published_event["data"])
        assert payload["type"] == "RUN_ERROR"
        assert payload["message"] == "DB connection failed"


@pytest.mark.asyncio
async def test_run_agent_and_stream_redis_context_error():
    request = ChatRequest(message="test", thread_id="t1", job_id="j1")

    # Mock get_agent to succeed so we hit the first redis context
    mock_agent = MagicMock()
    mock_agent.checkpointer.conn = None

    with (
        patch("src.worker.worker_runner.get_agent", return_value=mock_agent),
        patch("src.worker.worker_runner.get_redis_connection", side_effect=Exception("Redis down")),
        patch("src.worker.worker_runner.logger") as mock_logger,
    ):
        try:
            await run_agent_and_stream(request)
        except Exception as e:
            assert "Redis down" in str(e)

        mock_logger.error.assert_called()
        assert "Error during agent setup or streaming" in mock_logger.error.call_args[0][0]


@pytest.mark.asyncio
async def test_run_agent_and_stream_closes_pool():
    request = ChatRequest(message="test", thread_id="t1", job_id="j1")

    mock_pool = AsyncMock()
    # We must make it an instance of AsyncConnectionPool or mock the isinstance check

    mock_agent = MagicMock()
    mock_agent.checkpointer.conn = mock_pool

    mock_redis = AsyncMock()
    mock_cm = MagicMock()
    mock_cm.__aenter__.return_value = mock_redis

    # Mock stream_agent_events to be empty
    async def empty_stream(*args, **kwargs):
        yield {}

    with (
        patch("src.worker.worker_runner.get_agent", return_value=mock_agent),
        patch("src.worker.worker_runner.get_redis_connection", return_value=mock_cm),
        patch("src.worker.worker_runner.stream_agent_events", side_effect=empty_stream),
        patch("src.worker.worker_runner.isinstance", return_value=True),
    ):
        await run_agent_and_stream(request)
        mock_pool.close.assert_called_once()
