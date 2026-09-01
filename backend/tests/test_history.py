"""Tests for checkpointer → HistoryMessage mapping and GET /threads/{id}/history."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from langchain.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from src.auth import create_access_token
from src.history import _tool_calls_from_ai, checkpoint_messages_to_history, message_text
from src.models.chat_models import HistoryMessage, HistoryResponse


def test_message_text_string_and_blocks():
    assert message_text(HumanMessage(content="hi")) == "hi"
    msg = AIMessage(content=[{"type": "text", "text": "Hello"}, {"type": "text", "text": " world"}])
    assert message_text(msg) == "Hello world"

    class _Weird:
        content = 42

    assert message_text(_Weird()) == "42"

    class _NoneContent:
        content = None

    assert message_text(_NoneContent()) == ""
    assert message_text(AIMessage(content=[{"type": "image"}])) == ""


def test_checkpoint_messages_to_history_tool_loop():
    human = HumanMessage(content="weather in London?", id="h1")
    ai = AIMessage(
        content="",
        id="a1",
        tool_calls=[{"name": "tavily_search", "args": {"query": "London weather"}, "id": "call_1"}],
    )
    tool = ToolMessage(content="rain", tool_call_id="call_1", id="t1")
    ai2 = AIMessage(content="It is raining in London.", id="a2")

    rows = checkpoint_messages_to_history([human, ai, tool, ai2])
    assert len(rows) == 3
    assert rows[0].role == "user"
    assert rows[0].content == "weather in London?"
    assert rows[1].role == "assistant"
    assert rows[1].tool_calls[0].id == "call_1"
    assert rows[1].tool_calls[0].name == "tavily_search"
    assert rows[1].tool_calls[0].result == "rain"
    assert "London weather" in rows[1].tool_calls[0].args
    assert rows[2].content == "It is raining in London."
    assert rows[2].tool_calls == []


def test_checkpoint_messages_skips_unknown_types():
    rows = checkpoint_messages_to_history(
        [SystemMessage(content="sys"), HumanMessage(content="hi", id="h"), "not-a-message"]
    )
    assert len(rows) == 1
    assert rows[0].role == "user"


def test_checkpoint_messages_empty_and_none():
    assert checkpoint_messages_to_history(None) == []
    assert checkpoint_messages_to_history([]) == []


def test_message_text_list_string_and_output_text():
    msg = HumanMessage(content=["hi", {"type": "output_text", "text": " there"}])
    assert message_text(msg) == "hi there"


def test_tool_args_non_string_are_json_encoded():
    msg = MagicMock()
    msg.tool_calls = [{"name": "search", "args": 3, "id": "c1"}]
    calls = _tool_calls_from_ai(msg)
    assert calls[0].args == "3"


def test_attach_tool_result_edge_cases():
    human = HumanMessage(content="hi", id="h1")
    ai = AIMessage(
        content="",
        id="a1",
        tool_calls=[{"name": "search", "args": {"q": "x"}, "id": "call_1"}],
    )
    orphan = ToolMessage(content="no-id", tool_call_id="")
    unmatched = ToolMessage(content="nope", tool_call_id="other")
    too_early = ToolMessage(content="early", tool_call_id="call_1")

    rows = checkpoint_messages_to_history([human, too_early, ai, orphan, unmatched])
    assert rows[0].role == "user"
    assert rows[1].tool_calls[0].result is None


def test_history_message_without_id_gets_one():
    rows = checkpoint_messages_to_history([HumanMessage(content="anon")])
    assert rows[0].id
    assert rows[0].content == "anon"


def test_history_response_serializes_camel_case_tool_calls():
    msg = HistoryMessage(
        id="a1",
        role="assistant",
        content="done",
        tool_calls=[{"id": "c1", "name": "search", "args": "{}"}],
        status="done",
    )
    body = HistoryResponse(messages=[msg]).model_dump(by_alias=True)
    assert "toolCalls" in body["messages"][0]
    assert body["messages"][0]["toolCalls"][0]["id"] == "c1"


def _auth_header(user_id: str = "user-1") -> dict[str, str]:
    token = create_access_token({"user_id": user_id, "email": "a@b.com"})
    return {"Authorization": f"Bearer {token}"}


def _mock_pool(*, owned: bool):
    mock_pool = MagicMock()
    mock_conn = MagicMock()
    mock_cur = AsyncMock()
    mock_pool.connection.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.connection.return_value.__aexit__ = AsyncMock()
    mock_conn.cursor.return_value.__aenter__ = AsyncMock(return_value=mock_cur)
    mock_conn.cursor.return_value.__aexit__ = AsyncMock()
    mock_cur.fetchone.return_value = (1,) if owned else None
    return mock_pool


@pytest.mark.asyncio
async def test_history_requires_bearer():
    from main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/threads/thread-1/history")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_history_404_when_not_owned():
    from main import app

    pool = _mock_pool(owned=False)
    with patch("main.get_db_pool", return_value=pool):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/threads/thread-1/history", headers=_auth_header())
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_history_empty_checkpoint():
    from main import app

    pool = _mock_pool(owned=True)
    with (
        patch("main.get_db_pool", return_value=pool),
        patch("main.load_checkpoint_messages", new_callable=AsyncMock, return_value=[]),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/threads/thread-1/history", headers=_auth_header())
    assert response.status_code == 200
    assert response.json() == {"messages": []}


@pytest.mark.asyncio
async def test_history_maps_checkpoint_messages():
    from main import app

    pool = _mock_pool(owned=True)
    raw = [
        HumanMessage(content="hello", id="h1"),
        AIMessage(content="hi there", id="a1"),
    ]
    with (
        patch("main.get_db_pool", return_value=pool),
        patch("main.load_checkpoint_messages", new_callable=AsyncMock, return_value=raw),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/threads/thread-1/history", headers=_auth_header())
    assert response.status_code == 200
    body = response.json()
    assert len(body["messages"]) == 2
    assert body["messages"][0]["role"] == "user"
    assert body["messages"][0]["content"] == "hello"
    assert body["messages"][1]["role"] == "assistant"
    assert body["messages"][1]["toolCalls"] == []
    assert body["messages"][0]["id"] == "h1"


@pytest.mark.asyncio
async def test_load_checkpoint_messages_none_tuple():
    from src.history import load_checkpoint_messages

    pool = MagicMock()
    saver = MagicMock()
    saver.aget_tuple = AsyncMock(return_value=None)
    with patch("src.history.AsyncPostgresSaver", return_value=saver):
        messages = await load_checkpoint_messages(pool, "tid")
    assert messages == []
    saver.aget_tuple.assert_awaited_once()


@pytest.mark.asyncio
async def test_load_checkpoint_messages_reads_channel_values():
    from src.history import load_checkpoint_messages

    pool = MagicMock()
    saver = MagicMock()
    tup = MagicMock()
    tup.checkpoint = {"channel_values": {"messages": [HumanMessage(content="x", id="h")]}}
    saver.aget_tuple = AsyncMock(return_value=tup)
    with patch("src.history.AsyncPostgresSaver", return_value=saver):
        messages = await load_checkpoint_messages(pool, "tid")
    assert len(messages) == 1
    assert messages[0].content == "x"


@pytest.mark.asyncio
async def test_load_checkpoint_messages_empty_channels():
    from src.history import load_checkpoint_messages

    pool = MagicMock()
    saver = MagicMock()
    tup = MagicMock()
    tup.checkpoint = {}
    saver.aget_tuple = AsyncMock(return_value=tup)
    with patch("src.history.AsyncPostgresSaver", return_value=saver):
        assert await load_checkpoint_messages(pool, "tid") == []


@pytest.mark.asyncio
async def test_history_401_invalid_token():
    from main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get(
            "/threads/thread-1/history",
            headers={"Authorization": "Bearer not-a-jwt"},
        )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid token"


@pytest.mark.asyncio
async def test_history_401_token_missing_user_id():
    from main import app

    token = create_access_token({"email": "a@b.com"})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get(
            "/threads/thread-1/history",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid token"


@pytest.mark.asyncio
async def test_history_401_non_bearer_scheme():
    from main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get(
            "/threads/thread-1/history",
            headers={"Authorization": "Basic abc"},
        )
    assert response.status_code == 401
