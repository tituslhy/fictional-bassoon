"""Tests for API schema bootstrap and Citus worker/table distribution."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.db_bootstrap import (
    _ensure_citus_sharding,
    _ensure_messages_pkey_includes_thread_id,
    ensure_api_schema,
    parse_citus_worker_nodes,
)


def _sql(statement: str) -> str:
    return " ".join(statement.split())


class FakeCursor:
    """Dispatches fetchone/fetchall from the last execute() SQL."""

    def __init__(self, *, citus: bool = True) -> None:
        self.citus = citus
        self.executed: list[tuple[str, tuple | None]] = []
        self.distributed: set[str] = set()
        self.existing_relations: set[str] = {"checkpoints", "checkpoint_blobs", "checkpoint_writes"}
        self.registered_workers: set[tuple[str, int]] = set()
        self.messages_pk: list[str] = ["id"]
        self._last_sql = ""
        self.fail_distribute: str | None = None

    async def execute(self, sql: str, params: tuple | None = None) -> None:
        self._last_sql = _sql(sql)
        self.executed.append((self._last_sql, params))
        if self.fail_distribute and "create_distributed_table" in self._last_sql:
            table = params[0] if params else ""
            if table == self.fail_distribute:
                raise RuntimeError("invalid attnum")
        if "create_reference_table('api.users')" in self._last_sql:
            self.distributed.add("api.users")
        elif "create_distributed_table('api.threads'" in self._last_sql:
            self.distributed.add("api.threads")
        elif "create_distributed_table('api.messages'" in self._last_sql:
            self.distributed.add("api.messages")
        elif "create_distributed_table" in self._last_sql and params:
            self.distributed.add(params[0])
        if self._last_sql.startswith("SELECT citus_add_node"):
            assert params is not None
            self.registered_workers.add((params[0], int(params[1])))
        if "ADD PRIMARY KEY (thread_id, id)" in self._last_sql:
            self.messages_pk = ["thread_id", "id"]

    async def fetchone(self):
        sql = self._last_sql
        if "pg_extension" in sql:
            return (self.citus,)
        if "count(*)" in sql and "pg_dist_node" in sql:
            return (len(self.registered_workers),)
        if "pg_dist_partition" in sql:
            rel = self.executed[-1][1][0] if self.executed[-1][1] else ""
            return (rel in self.distributed,)
        if "to_regclass" in sql:
            rel = self.executed[-1][1][0] if self.executed[-1][1] else ""
            return (rel in self.existing_relations,)
        if "pg_constraint" in sql or "pg_policies" in sql:
            return (False,)
        return None

    async def fetchall(self):
        sql = self._last_sql
        if "pg_dist_node" in sql:
            return sorted(self.registered_workers)
        if "indisprimary" in sql:
            return [(c,) for c in self.messages_pk]
        return []


def test_parse_citus_worker_nodes():
    assert parse_citus_worker_nodes("") == []
    assert parse_citus_worker_nodes("  ") == []
    assert parse_citus_worker_nodes("citus_worker_1:5432,citus_worker_2:5432") == [
        ("citus_worker_1", 5432),
        ("citus_worker_2", 5432),
    ]


@pytest.mark.asyncio
async def test_ensure_citus_sharding_skips_without_extension():
    cur = FakeCursor(citus=False)
    await _ensure_citus_sharding(cur)
    assert not any("citus_add_node" in sql for sql, _ in cur.executed)
    assert not any("create_distributed_table" in sql for sql, _ in cur.executed)


@pytest.mark.asyncio
async def test_ensure_citus_sharding_registers_workers_and_distributes():
    cur = FakeCursor()
    env = {
        "CITUS_COORDINATOR_HOST": "citus_coordinator",
        "CITUS_COORDINATOR_PORT": "5432",
        "CITUS_WORKER_NODES": "citus_worker_1:5432,citus_worker_2:5432",
    }
    with patch.dict("os.environ", env, clear=False):
        await _ensure_citus_sharding(cur)

    assert cur.registered_workers == {("citus_worker_1", 5432), ("citus_worker_2", 5432)}
    assert cur.messages_pk == ["thread_id", "id"]
    sqls = [sql for sql, _ in cur.executed]
    assert any("create_reference_table('api.users')" in s for s in sqls)
    assert any("create_distributed_table('api.threads', 'id')" in s for s in sqls)
    assert any("create_distributed_table('api.messages', 'thread_id'" in s for s in sqls)
    drop_idx = next(i for i, s in enumerate(sqls) if "DROP TRIGGER" in s)
    ref_idx = next(i for i, s in enumerate(sqls) if "create_reference_table('api.users')" in s)
    assert drop_idx < ref_idx
    assert not any("shouldhaveshards" in s for s in sqls)
    assert any("threads_user_id_fkey" in s and "ADD CONSTRAINT" in s for s in sqls)
    assert any(params == ("checkpoints",) for _, params in cur.executed if params)
    assert any(
        params == ("checkpoint_blobs", "checkpoints") for _, params in cur.executed if params
    )


@pytest.mark.asyncio
async def test_ensure_citus_sharding_skips_already_registered_workers():
    cur = FakeCursor()
    cur.registered_workers.add(("citus_worker_1", 5432))
    with patch.dict("os.environ", {"CITUS_WORKER_NODES": "citus_worker_1:5432"}, clear=False):
        await _ensure_citus_sharding(cur)
    add_node_calls = [p for sql, p in cur.executed if "citus_add_node" in sql]
    assert add_node_calls == []


@pytest.mark.asyncio
async def test_checkpoint_distribute_failure_is_swallowed():
    cur = FakeCursor()
    cur.fail_distribute = "checkpoints"
    with patch.dict("os.environ", {"CITUS_WORKER_NODES": ""}, clear=False):
        await _ensure_citus_sharding(cur)
    sqls = [sql for sql, _ in cur.executed]
    assert any("create_distributed_table('api.threads'" in s for s in sqls)
    assert any("shouldhaveshards" in s for s in sqls)
    blob_attempts = [
        p
        for sql, p in cur.executed
        if p and p[0] == "checkpoint_blobs" and "create_distributed" in sql
    ]
    assert blob_attempts == []


@pytest.mark.asyncio
async def test_messages_pk_already_compound_is_left_alone():
    cur = FakeCursor()
    cur.messages_pk = ["thread_id", "id"]
    await _ensure_messages_pkey_includes_thread_id(cur)
    assert not any("DROP CONSTRAINT" in sql for sql, _ in cur.executed)


@pytest.mark.asyncio
async def test_ensure_api_schema_runs_statements_then_citus():
    cur = FakeCursor(citus=False)
    conn = MagicMock()
    conn.cursor.return_value.__aenter__ = AsyncMock(return_value=cur)
    conn.cursor.return_value.__aexit__ = AsyncMock(return_value=None)
    pool = MagicMock()
    pool.connection.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.connection.return_value.__aexit__ = AsyncMock(return_value=None)

    await ensure_api_schema(pool)

    assert any("CREATE TABLE IF NOT EXISTS api.users" in sql for sql, _ in cur.executed)
    assert any("pg_extension" in sql for sql, _ in cur.executed)


@pytest.mark.asyncio
async def test_already_distributed_tables_skip_blocker_drop():
    cur = FakeCursor()
    cur.distributed = {"api.users", "api.threads", "api.messages"}
    with patch.dict("os.environ", {"CITUS_WORKER_NODES": "citus_worker_1:5432"}, clear=False):
        await _ensure_citus_sharding(cur)
    sqls = [sql for sql, _ in cur.executed]
    assert not any("DROP TRIGGER" in s for s in sqls)
    assert not any("create_reference_table" in s for s in sqls)
    assert not any("ADD CONSTRAINT" in s for s in sqls)
