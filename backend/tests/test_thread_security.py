from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from src.auth import create_access_token
from src.db import get_db_pool


def headers(user_id):
    return {"Authorization": "Bearer " + create_access_token({"user_id": user_id})}


@pytest.fixture
def pool():
    cur = AsyncMock()
    cur.fetchone.return_value = None
    cur.fetchall.return_value = []
    conn = MagicMock()
    conn.cursor.return_value.__aenter__ = AsyncMock(return_value=cur)
    p = MagicMock()
    p.connection.return_value.__aenter__ = AsyncMock(return_value=conn)
    app.dependency_overrides[get_db_pool] = lambda: p
    yield p, cur
    app.dependency_overrides.pop(get_db_pool, None)


class FinishedStream:
    async def listen(self):
        yield {"type": "message", "data": '{"event":"RUN_FINISHED","data":"{}"}'}

    async def unsubscribe(self, *args):
        pass

    async def close(self):
        pass


@pytest.mark.asyncio
@pytest.mark.parametrize("identity,expected", [(None, 401), ("other-user", 404)])
async def test_chat_rejects_unowned_thread_before_enqueuing(pool, identity, expected):
    with (
        patch("main.subscribe", return_value=FinishedStream()),
        patch("main.run_agent_task.delay") as enqueue,
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post(
                "/chat",
                json={"message": "injected", "thread_id": str(uuid4())},
                headers=headers(identity) if identity else {},
            )
        assert r.status_code == expected
        enqueue.assert_not_called()


@pytest.mark.asyncio
async def test_thread_routes_require_authentication():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        for method, path, body in [
            ("GET", "/threads", None),
            ("POST", "/threads", {"title": "x"}),
            ("PATCH", "/threads/" + str(uuid4()), {"title": "x"}),
            ("DELETE", "/threads/" + str(uuid4()), None),
        ]:
            r = await c.request(method, path, json=body)
            assert r.status_code == 401


@pytest.mark.asyncio
async def test_catalog_is_scoped_to_authenticated_user(pool):
    _, cur = pool
    user = str(uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/threads?user_id=someone-else", headers=headers(user))
    assert r.status_code == 200
    assert r.json() == []
    sql, params = cur.execute.call_args.args
    assert "WHERE user_id = %s" in sql
    assert params == (user,)


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["PATCH", "DELETE"])
async def test_mutations_of_other_users_threads_return_404(pool, method):
    _, cur = pool
    tid, user = str(uuid4()), str(uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.request(
            method,
            "/threads/" + tid,
            headers=headers(user),
            json={"title": "changed"} if method == "PATCH" else None,
        )
    assert r.status_code == 404
    sql, params = cur.execute.call_args.args
    assert "user_id = %s" in sql
    assert params[-1] == user


@pytest.mark.asyncio
async def test_a2a_requires_authentication():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post(
            "/a2a",
            headers={"A2A-Version": "1.0"},
            json={"jsonrpc": "2.0", "id": "test", "method": "ListTasks", "params": {}},
        )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_a2a_cannot_reuse_another_users_context():
    from a2a.utils.errors import InvalidParamsError

    from src.protocol.executor import ChatAgentExecutor

    context = MagicMock()
    context.task_id = str(uuid4())
    context.context_id = str(uuid4())
    context.call_context.user.is_authenticated = True
    context.call_context.user.user_name = str(uuid4())
    context.get_user_input.return_value = "injected"
    p = MagicMock()
    cur = AsyncMock()
    cur.fetchone.return_value = None
    conn = MagicMock()
    conn.cursor.return_value.__aenter__ = AsyncMock(return_value=cur)
    p.connection.return_value.__aenter__ = AsyncMock(return_value=conn)
    queue = MagicMock()
    queue.enqueue_event = AsyncMock()
    with (
        patch("src.db.get_db_pool", return_value=p),
        patch("src.protocol.executor.subscribe", return_value=FinishedStream()),
        patch("src.protocol.executor.run_agent_task.delay"),
    ):
        with pytest.raises(InvalidParamsError):
            await ChatAgentExecutor().execute(context, queue)


@pytest.mark.asyncio
async def test_chat_normalizes_checkpoint_key_and_replaces_client_job_id(pool):
    from src.models.chat_models import ChatRequest
    from src.threads import authorize_chat

    p, cur = pool
    cur.fetchone.return_value = (1,)
    result = await authorize_chat(
        ChatRequest(
            message="hi", thread_id="ABCDEFAB123412341234ABCDEFABCDEF", job_id="chosen-channel"
        ),
        str(uuid4()),
        p,
    )
    assert result.thread_id == "abcdefab-1234-1234-1234-abcdefabcdef"
    assert result.job_id != "chosen-channel"


def test_agent_card_advertises_bearer_authentication():
    from src.protocol.agent_card import build_agent_card

    card = build_agent_card()
    assert card.security_schemes["bearer"].http_auth_security_scheme.scheme == "bearer"
    assert "bearer" in card.security_requirements[0].schemes
