"""Owner-scoped thread operations; browser roles cannot access base tables."""

from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from psycopg_pool import AsyncConnectionPool

from src.auth import require_user_id
from src.db import get_db_pool
from src.models.chat_models import ChatRequest
from src.models.thread_models import ThreadCreate, ThreadSummary, ThreadUpdate

router = APIRouter(prefix="/threads")
User = Annotated[str, Depends(require_user_id)]
Pool = Annotated[AsyncConnectionPool, Depends(get_db_pool)]


def thread_uuid(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise HTTPException(404, "Thread not found") from None


async def require_owned_thread(pool, thread_id: str, user_id: str) -> None:
    tid = thread_uuid(thread_id)
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT 1 FROM api.threads WHERE id = %s AND user_id = %s AND deleted_at IS NULL",
                (tid, user_id),
            )
            owned = await cur.fetchone()
    if not owned:
        raise HTTPException(404, "Thread not found")


def summary(row) -> ThreadSummary:
    return ThreadSummary(id=row[0], title=row[1] or "New chat", updated_at=row[2])


@router.get("", response_model=list[ThreadSummary])
async def list_threads(user_id: User, pool: Pool):
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT id, title, updated_at FROM api.threads WHERE user_id = %s AND deleted_at IS NULL ORDER BY updated_at DESC",
                (user_id,),
            )
            return [summary(row) for row in await cur.fetchall()]


@router.post("", response_model=ThreadSummary, status_code=201)
async def create_thread(body: ThreadCreate, user_id: User, pool: Pool):
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO api.threads (id, user_id, title) VALUES (%s, %s, %s) "
                "ON CONFLICT (id) DO NOTHING RETURNING id, title, updated_at",
                (body.id, user_id, body.title),
            )
            row = await cur.fetchone()
    if row is None:
        raise HTTPException(409, "Thread could not be created")
    return summary(row)


@router.patch("/{thread_id}", response_model=ThreadSummary)
async def update_thread(thread_id: UUID, body: ThreadUpdate, user_id: User, pool: Pool):
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE api.threads SET title = %s, updated_at = now() "
                "WHERE id = %s AND user_id = %s AND deleted_at IS NULL RETURNING id, title, updated_at",
                (body.title, thread_id, user_id),
            )
            row = await cur.fetchone()
    if row is None:
        raise HTTPException(404, "Thread not found")
    return summary(row)


# Keep the owner reservation after deletion: checkpoint writes from an in-flight
# run must never become claimable by someone recreating the same context ID.
@router.delete("/{thread_id}", status_code=204)
async def delete_thread(thread_id: UUID, user_id: User, pool: Pool):
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE api.threads SET deleted_at = now() WHERE id = %s AND user_id = %s AND deleted_at IS NULL RETURNING id",
                (thread_id, user_id),
            )
            row = await cur.fetchone()
    if row is None:
        raise HTTPException(404, "Thread not found")
    return Response(status_code=204)


async def authorize_chat(request: ChatRequest, user_id: User, pool: Pool) -> ChatRequest:
    # Dependencies run before FastAPI opens the SSE response.
    await require_owned_thread(pool, request.thread_id, user_id)
    message = request.message
    if request.a2ui_action is not None:
        from src.history import load_checkpoint_messages
        from src.interactive_ui import resolve_action, surface_from_tool

        messages = await load_checkpoint_messages(pool, str(thread_uuid(request.thread_id)))
        surfaces = [
            surface for item in messages if (surface := surface_from_tool(item)) is not None
        ]
        try:
            message = resolve_action(request.a2ui_action, surfaces)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
    return request.model_copy(
        update={
            "job_id": str(uuid4()),
            "thread_id": str(thread_uuid(request.thread_id)),
            "message": message,
        }
    )


async def authorize_agent_thread(context, thread_id: str) -> str:
    """Claim a new A2A context or check ownership of an existing one."""
    from a2a.utils.errors import InvalidParamsError

    from src import db

    user = context.call_context.user
    if not user.is_authenticated or not isinstance(user.user_name, str):
        raise InvalidParamsError(message="Authentication required")
    try:
        tid = thread_uuid(thread_id)
    except HTTPException:
        raise InvalidParamsError(message="Invalid context ID") from None
    if thread_id != str(tid):
        raise InvalidParamsError(message="Context ID must be a canonical UUID")
    pool = await db.get_db_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO api.threads (id, user_id, title) VALUES (%s, %s, %s) "
                "ON CONFLICT (id) DO NOTHING",
                (tid, user.user_name, "Agent conversation"),
            )
    try:
        await require_owned_thread(pool, thread_id, user.user_name)
    except HTTPException:
        raise InvalidParamsError(message="Thread not found") from None

    return str(tid)
