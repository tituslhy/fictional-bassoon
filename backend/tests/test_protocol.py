"""Tests for the A2A protocol layer (executor, agent card, router)."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from a2a.server.events import EventQueue
from a2a.types.a2a_pb2 import TaskState

from src.protocol.executor import ChatAgentExecutor, _agent_message, _status_event


@pytest.fixture
def mock_context():
    """Create a mock RequestContext for A2A executor tests."""
    context = MagicMock()
    context.task_id = "test_task_123"
    context.context_id = "test_thread_456"
    context.get_user_input.return_value = "What is the weather?"
    return context


@pytest.fixture
def mock_event_queue():
    """Create an async mock event queue."""
    queue = MagicMock(spec=EventQueue)
    queue.enqueue_event = AsyncMock()
    return queue


@pytest.fixture
def mock_pubsub():
    """Create a mock pub/sub subscription."""
    pubsub = MagicMock()
    pubsub.listen = AsyncMock()
    pubsub.unsubscribe = AsyncMock()
    pubsub.close = AsyncMock()
    return pubsub


class TestAgentMessage:
    """Tests for the _agent_message helper function."""

    def test_agent_message_structure(self):
        """Verify _agent_message creates a properly structured message."""
        msg = _agent_message("ctx_123", "task_456", "Hello world")

        assert msg.context_id == "ctx_123"
        assert msg.task_id == "task_456"
        assert len(msg.parts) == 1
        assert msg.parts[0].text == "Hello world"
        # role should be ROLE_AGENT (enum value 2)
        assert msg.role == 2

    def test_agent_message_empty_text(self):
        """Verify _agent_message handles empty text."""
        msg = _agent_message("ctx_123", "task_456", "")

        assert msg.parts[0].text == ""


class TestStatusEvent:
    """Tests for the _status_event helper function."""

    def test_status_event_without_text(self):
        """Verify _status_event creates status update without message text."""
        event = _status_event("task_123", "ctx_456", TaskState.TASK_STATE_WORKING)

        assert event.task_id == "task_123"
        assert event.context_id == "ctx_456"
        assert event.status.state == TaskState.TASK_STATE_WORKING

    def test_status_event_with_text(self):
        """Verify _status_event creates status update with message text."""
        event = _status_event(
            "task_123",
            "ctx_456",
            TaskState.TASK_STATE_COMPLETED,
            text="Agent response",
        )

        assert event.task_id == "task_123"
        assert event.context_id == "ctx_456"
        assert event.status.state == TaskState.TASK_STATE_COMPLETED
        assert event.status.message.parts[0].text == "Agent response"


class TestChatAgentExecutor:
    """Tests for ChatAgentExecutor.execute() method."""

    @pytest.mark.asyncio
    async def test_execute_happy_path_completed(self, mock_context, mock_event_queue, mock_pubsub):
        """Test execute() happy path with successful completion."""
        # Arrange
        events_published = []

        async def capture_events(event):
            events_published.append(event)

        mock_event_queue.enqueue_event.side_effect = capture_events

        # Mock pub/sub to return TEXT_MESSAGE_CONTENT and RUN_FINISHED
        async def mock_listen():
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "RUN_STARTED",
                        "data": json.dumps(
                            {"threadId": "test_thread_456", "runId": "test_task_123"}
                        ),
                    }
                ),
            }
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "TEXT_MESSAGE_CONTENT",
                        "data": json.dumps({"messageId": "msg_1", "delta": "Hello "}),
                    }
                ),
            }
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "TEXT_MESSAGE_CONTENT",
                        "data": json.dumps({"messageId": "msg_1", "delta": "world"}),
                    }
                ),
            }
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "RUN_FINISHED",
                        "data": json.dumps(
                            {"threadId": "test_thread_456", "runId": "test_task_123"}
                        ),
                    }
                ),
            }

        mock_pubsub.listen = mock_listen

        executor = ChatAgentExecutor()

        with patch("src.protocol.executor.subscribe", return_value=mock_pubsub):
            with patch("src.protocol.executor.run_agent_task") as mock_task:
                mock_task.delay = MagicMock()

                # Act
                await executor.execute(mock_context, mock_event_queue)

        # Assert
        # Should have published: Task (submitted), Task (working), Task (completed)
        assert mock_event_queue.enqueue_event.call_count >= 2

        # Verify submitted event was first (Task object with TASK_STATE_SUBMITTED)
        submitted_event = events_published[0]
        assert submitted_event.id == "test_task_123"
        assert submitted_event.context_id == "test_thread_456"
        assert submitted_event.status.state == TaskState.TASK_STATE_SUBMITTED

        # Verify completed event was last (TaskStatusUpdateEvent with TASK_STATE_COMPLETED)
        completed_event = events_published[-1]
        assert completed_event.task_id == "test_task_123"
        assert completed_event.context_id == "test_thread_456"
        assert completed_event.status.state == TaskState.TASK_STATE_COMPLETED
        # Verify answer text concatenation
        assert "Hello world" in completed_event.status.message.parts[0].text

    @pytest.mark.asyncio
    async def test_execute_error_path(self, mock_context, mock_event_queue, mock_pubsub):
        """Test execute() when RUN_ERROR event is received."""
        events_published = []

        async def capture_events(event):
            events_published.append(event)

        mock_event_queue.enqueue_event.side_effect = capture_events

        # Mock pub/sub to return RUN_ERROR
        async def mock_listen():
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "RUN_ERROR",
                        "data": json.dumps({"message": "Agent failed: ValueError"}),
                    }
                ),
            }

        mock_pubsub.listen = mock_listen

        executor = ChatAgentExecutor()

        with patch("src.protocol.executor.subscribe", return_value=mock_pubsub):
            with patch("src.protocol.executor.run_agent_task") as mock_task:
                mock_task.delay = MagicMock()

                # Act
                await executor.execute(mock_context, mock_event_queue)

        # Assert
        # Last event should be TASK_STATE_FAILED
        failed_event = events_published[-1]
        assert failed_event.status.state == TaskState.TASK_STATE_FAILED
        assert "Agent failed: ValueError" in failed_event.status.message.parts[0].text

    @pytest.mark.asyncio
    async def test_execute_idle_timeout_fails_task(
        self, mock_context, mock_event_queue, mock_pubsub
    ):
        """A worker that stops publishing mid-run fails the task instead of hanging."""
        import asyncio

        events_published = []

        async def capture_events(event):
            events_published.append(event)

        mock_event_queue.enqueue_event.side_effect = capture_events

        # One WORKING-triggering event, then silence forever (dead worker).
        async def mock_listen():
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "TEXT_MESSAGE_CONTENT",
                        "data": json.dumps({"delta": "partial"}),
                    }
                ),
            }
            await asyncio.Event().wait()

        mock_pubsub.listen = mock_listen

        executor = ChatAgentExecutor()

        with patch("src.protocol.executor.subscribe", return_value=mock_pubsub):
            with patch("src.protocol.executor.run_agent_task") as mock_task:
                mock_task.delay = MagicMock()
                with patch("src.protocol.executor.IDLE_TIMEOUT_SECONDS", 0.05):
                    await executor.execute(mock_context, mock_event_queue)

        failed_event = events_published[-1]
        assert failed_event.status.state == TaskState.TASK_STATE_FAILED
        assert "presumed dead" in failed_event.status.message.parts[0].text
        # The pub/sub subscription is still cleaned up on the timeout path.
        mock_pubsub.unsubscribe.assert_awaited()
        mock_pubsub.close.assert_awaited()

    @pytest.mark.asyncio
    async def test_execute_missing_task_id(self, mock_context, mock_event_queue):
        """Test execute() with missing task_id."""
        mock_context.task_id = None
        mock_context.context_id = "test_thread_456"

        events_published = []

        async def capture_events(event):
            events_published.append(event)

        mock_event_queue.enqueue_event.side_effect = capture_events

        executor = ChatAgentExecutor()

        # Act
        await executor.execute(mock_context, mock_event_queue)

        # Assert
        # Should publish a TASK_STATE_FAILED event immediately
        assert len(events_published) >= 1
        failed_event = events_published[-1]
        assert failed_event.status.state == TaskState.TASK_STATE_FAILED
        assert "missing task_id" in failed_event.status.message.parts[0].text

    @pytest.mark.asyncio
    async def test_execute_missing_context_id(self, mock_context, mock_event_queue):
        """Test execute() with missing context_id."""
        mock_context.task_id = "test_task_123"
        mock_context.context_id = None

        events_published = []

        async def capture_events(event):
            events_published.append(event)

        mock_event_queue.enqueue_event.side_effect = capture_events

        executor = ChatAgentExecutor()

        # Act
        await executor.execute(mock_context, mock_event_queue)

        # Assert
        # Should publish a TASK_STATE_FAILED event immediately
        assert len(events_published) >= 1
        failed_event = events_published[-1]
        assert failed_event.status.state == TaskState.TASK_STATE_FAILED
        assert "missing task_id" in failed_event.status.message.parts[0].text

    @pytest.mark.asyncio
    async def test_execute_enqueue_failure(self, mock_context, mock_event_queue, mock_pubsub):
        """Test execute() when run_agent_task.delay() raises an exception."""
        events_published = []

        async def capture_events(event):
            events_published.append(event)

        mock_event_queue.enqueue_event.side_effect = capture_events
        mock_pubsub.unsubscribe = AsyncMock()
        mock_pubsub.close = AsyncMock()

        executor = ChatAgentExecutor()

        with patch("src.protocol.executor.subscribe", return_value=mock_pubsub):
            with patch("src.protocol.executor.run_agent_task") as mock_task:
                # Make delay() raise an exception
                mock_task.delay = MagicMock(side_effect=RuntimeError("Broker connection failed"))

                # Act
                await executor.execute(mock_context, mock_event_queue)

        # Assert
        # Should have published a TASK_STATE_FAILED event
        failed_event = events_published[-1]
        assert failed_event.status.state == TaskState.TASK_STATE_FAILED
        assert "Broker connection failed" in failed_event.status.message.parts[0].text

        # Should have cleaned up pub/sub
        mock_pubsub.unsubscribe.assert_called()
        mock_pubsub.close.assert_called()

    @pytest.mark.asyncio
    async def test_execute_ignores_non_message_events(
        self, mock_context, mock_event_queue, mock_pubsub
    ):
        """Test that execute() ignores non-message pubsub events."""
        events_published = []

        async def capture_events(event):
            events_published.append(event)

        mock_event_queue.enqueue_event.side_effect = capture_events

        # Mock pub/sub to return mixed event types
        async def mock_listen():
            yield {"type": "subscribe", "data": "ignored"}
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "TEXT_MESSAGE_CONTENT",
                        "data": json.dumps({"messageId": "msg_1", "delta": "Answer"}),
                    }
                ),
            }
            yield {"type": "unsubscribe", "data": "ignored"}
            yield {
                "type": "message",
                "data": json.dumps(
                    {
                        "event": "RUN_FINISHED",
                        "data": json.dumps({"threadId": "test_thread_456"}),
                    }
                ),
            }

        mock_pubsub.listen = mock_listen

        executor = ChatAgentExecutor()

        with patch("src.protocol.executor.subscribe", return_value=mock_pubsub):
            with patch("src.protocol.executor.run_agent_task") as mock_task:
                mock_task.delay = MagicMock()

                # Act
                await executor.execute(mock_context, mock_event_queue)

        # Assert
        # Verify the answer was captured correctly
        completed_event = events_published[-1]
        assert completed_event.status.state == TaskState.TASK_STATE_COMPLETED
        assert "Answer" in completed_event.status.message.parts[0].text

    @pytest.mark.asyncio
    async def test_cancel_raises_unsupported_operation(self, mock_context, mock_event_queue):
        """Test that cancel() raises UnsupportedOperationError."""
        from a2a.utils.errors import UnsupportedOperationError

        executor = ChatAgentExecutor()

        # cancel() is async, so use pytest.raises with the actual call
        with pytest.raises(UnsupportedOperationError):
            await executor.cancel(mock_context, mock_event_queue)


class TestAgentCard:
    """Tests for agent card generation and serving."""

    def test_agent_card_schema_valid(self):
        """Verify the agent card meets A2A schema requirements."""
        from src.protocol.agent_card import build_agent_card

        card = build_agent_card()

        # Basic required fields
        assert card.name == "fictional-bassoon-chat-agent"
        assert card.version == "0.1.0"
        assert len(card.supported_interfaces) > 0
        # Should support streaming
        assert card.capabilities.streaming is True
        # Should not have push notifications (per design)
        assert card.capabilities.push_notifications is False
        # Should have at least the chat skill
        assert len(card.skills) > 0
        skill_names = [skill.name for skill in card.skills]
        assert "Conversational chat" in skill_names


class TestRouter:
    """Tests for the A2A JSON-RPC router."""

    def test_router_mounting(self):
        """Verify router can be built and mounted on FastAPI."""
        from fastapi import FastAPI

        from src.protocol.router import build_a2a_router

        app = FastAPI()
        router = build_a2a_router()

        # Should return an APIRouter
        assert router is not None
        # Should be mountable on FastAPI
        app.include_router(router, prefix="/a2a")


class TestTaskStore:
    def test_sqlalchemy_url_from_postgres_uri(self):
        from src.protocol.task_store import sqlalchemy_url_from_db_uri

        assert (
            sqlalchemy_url_from_db_uri("postgresql://u:p@h:6432/db")
            == "postgresql+psycopg://u:p@h:6432/db"
        )
        assert sqlalchemy_url_from_db_uri("postgresql+psycopg://x") == "postgresql+psycopg://x"

    def test_build_inmemory_without_db_uri(self):
        from a2a.server.tasks import InMemoryTaskStore

        from src.protocol import task_store as ts

        ts._store = None
        with patch.dict("os.environ", {}, clear=True):
            store = ts.build_task_store()
        assert isinstance(store, InMemoryTaskStore)

    def test_build_postgres_when_db_uri_set(self):
        from src.protocol import task_store as ts

        mock_store = MagicMock()
        mock_engine = MagicMock()
        with (
            patch.dict("os.environ", {"DB_URI": "postgresql://u:p@h:6432/db"}, clear=True),
            patch("sqlalchemy.ext.asyncio.create_async_engine", return_value=mock_engine),
            patch("a2a.server.tasks.DatabaseTaskStore", return_value=mock_store) as store_cls,
        ):
            store = ts.build_task_store()

        assert store is mock_store
        store_cls.assert_called_once()
        assert store_cls.call_args.kwargs["table_name"] == "a2a_tasks"
        assert store_cls.call_args.kwargs["create_table"] is True

    @pytest.mark.asyncio
    async def test_init_task_store_calls_initialize(self):
        from src.protocol import task_store as ts

        mock_store = MagicMock()
        mock_store.initialize = AsyncMock()
        ts._store = mock_store
        try:
            await ts.init_task_store()
            mock_store.initialize.assert_awaited_once()
        finally:
            ts._store = None
