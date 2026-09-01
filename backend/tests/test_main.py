import asyncio
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


@pytest.mark.asyncio
async def test_chat_idle_timeout_emits_run_error():
    class HangPubSub:
        async def listen(self):
            yield {"type": "subscribe", "data": None}
            await asyncio.sleep(30)

        async def unsubscribe(self, channel):
            pass

        async def close(self):
            pass

    with (
        patch("main.subscribe", return_value=HangPubSub()),
        patch("main.run_agent_task.delay"),
        patch("main.IDLE_TIMEOUT_SECONDS", 0.05),
    ):
        payload = {"message": "hi", "thread_id": "t1"}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/chat", json=payload)

    assert response.status_code == 200
    assert "event: RUN_ERROR" in response.text
    assert "Worker idle timeout" in response.text
    assert "event: RUN_FINISHED" not in response.text


@pytest.mark.asyncio
async def test_chat_idle_timeout_closes_open_text_message():
    start_data = json.dumps({"type": "TEXT_MESSAGE_START", "messageId": "m-open"})

    class HangAfterStart:
        async def listen(self):
            yield {
                "type": "message",
                "data": json.dumps({"event": "TEXT_MESSAGE_START", "data": start_data}),
            }
            await asyncio.sleep(30)

        async def unsubscribe(self, channel):
            pass

        async def close(self):
            pass

    with (
        patch("main.subscribe", return_value=HangAfterStart()),
        patch("main.run_agent_task.delay"),
        patch("main.IDLE_TIMEOUT_SECONDS", 0.05),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/chat", json={"message": "hi", "thread_id": "t1"})

    assert response.status_code == 200
    assert "event: TEXT_MESSAGE_START" in response.text
    assert "event: TEXT_MESSAGE_END" in response.text
    start_at = response.text.index("event: TEXT_MESSAGE_START")
    end_at = response.text.index("event: TEXT_MESSAGE_END")
    error_at = response.text.index("event: RUN_ERROR")
    assert start_at < end_at < error_at
    assert "event: RUN_FINISHED" not in response.text


def test_agui_payload_field_and_idle_close_helpers():
    from main import _agui_payload_field, _idle_timeout_close_events

    assert _agui_payload_field("not json", "messageId") is None
    assert _agui_payload_field("[]", "messageId") is None
    assert _agui_payload_field("{}", "messageId") is None
    assert _agui_payload_field('{"messageId": "m1"}', "messageId") == "m1"
    assert _agui_payload_field('{"message_id": "m2"}', "messageId", "message_id") == "m2"

    empty = _idle_timeout_close_events(None, None, None)
    assert empty == []
    closed = _idle_timeout_close_events("t1", "r1", "worker")
    assert [e.event for e in closed] == [
        "TEXT_MESSAGE_END",
        "REASONING_MESSAGE_END",
        "STEP_FINISHED",
    ]


@pytest.mark.asyncio
async def test_chat_idle_timeout_closes_reasoning_and_step():
    class HangAfterOpen:
        async def listen(self):
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "STEP_STARTED",
                        "data": json.dumps({"type": "STEP_STARTED", "stepName": "worker_a"}),
                    }
                ),
            }
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "REASONING_MESSAGE_START",
                        "data": json.dumps(
                            {"type": "REASONING_MESSAGE_START", "messageId": "r-open"}
                        ),
                    }
                ),
            }
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "TEXT_MESSAGE_END",
                        "data": json.dumps({"type": "TEXT_MESSAGE_END", "messageId": "gone"}),
                    }
                ),
            }
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "REASONING_MESSAGE_END",
                        "data": json.dumps(
                            {"type": "REASONING_MESSAGE_END", "messageId": "r-open"}
                        ),
                    }
                ),
            }
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "STEP_FINISHED",
                        "data": json.dumps({"type": "STEP_FINISHED", "stepName": "worker_a"}),
                    }
                ),
            }
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "STEP_STARTED",
                        "data": json.dumps({"type": "STEP_STARTED", "stepName": "worker_b"}),
                    }
                ),
            }
            await asyncio.sleep(30)

        async def unsubscribe(self, channel):
            pass

        async def close(self):
            pass

    with (
        patch("main.subscribe", return_value=HangAfterOpen()),
        patch("main.run_agent_task.delay"),
        patch("main.IDLE_TIMEOUT_SECONDS", 0.05),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/chat", json={"message": "hi", "thread_id": "t1"})

    assert "event: STEP_FINISHED" in response.text
    assert "event: RUN_ERROR" in response.text
    assert response.text.rindex("event: STEP_FINISHED") < response.text.index("event: RUN_ERROR")


@pytest.mark.asyncio
async def test_chat_enqueue_failure_closes_pubsub():
    class MockPubSub:
        def __init__(self):
            self.unsubscribed = False
            self.closed = False

        async def listen(self):
            yield {"type": "message", "data": "{}"}

        async def unsubscribe(self, channel):
            self.unsubscribed = True

        async def close(self):
            self.closed = True

    pubsub = MockPubSub()
    with (
        patch("main.subscribe", return_value=pubsub),
        patch("main.run_agent_task.delay", side_effect=RuntimeError("broker down")),
        pytest.raises(ExceptionGroup),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            await ac.post("/chat", json={"message": "hi", "thread_id": "t1"})
    assert pubsub.unsubscribed
    assert pubsub.closed


@pytest.mark.asyncio
async def test_chat_stop_async_iteration_and_complex_payload():
    class MockPubSub:
        async def listen(self):
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "CUSTOM",
                        "name": "a2ui",
                        "value": {"component": "column"},
                    }
                ),
            }
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "RUN_FINISHED",
                        "data": json.dumps({"type": "RUN_FINISHED"}),
                    }
                ),
            }

        async def unsubscribe(self, channel):
            pass

        async def close(self):
            pass

    with (
        patch("main.subscribe", return_value=MockPubSub()),
        patch("main.run_agent_task.delay"),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/chat", json={"message": "hi", "thread_id": "t1"})

    assert response.status_code == 200
    assert "event: CUSTOM" in response.text
    assert '"name": "a2ui"' in response.text
    assert "event: RUN_FINISHED" in response.text


@pytest.mark.asyncio
async def test_chat_listen_exhausts_without_terminal():
    class EmptyPubSub:
        async def listen(self):
            if False:
                yield {"type": "message", "data": "{}"}

        async def unsubscribe(self, channel):
            pass

        async def close(self):
            pass

    with (
        patch("main.subscribe", return_value=EmptyPubSub()),
        patch("main.run_agent_task.delay"),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/chat", json={"message": "hi", "thread_id": "t1"})

    assert response.status_code == 200
    assert "event: RUN_FINISHED" not in response.text
    assert "event: RUN_ERROR" not in response.text
