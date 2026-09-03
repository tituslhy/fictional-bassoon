"""Tests for API schema bootstrap on single-node Postgres."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from src.db_bootstrap import BOOTSTRAP_STATEMENTS, ensure_api_schema


def _sql(statement: str) -> str:
    return " ".join(statement.split())


class FakeCursor:
    def __init__(self) -> None:
        self.executed: list[str] = []

    async def execute(self, sql: str, params: tuple | None = None) -> None:
        self.executed.append(_sql(sql))


def test_bootstrap_statements_cover_schema_roles_rls_and_triggers():
    sqls = [_sql(s) for s in BOOTSTRAP_STATEMENTS]
    joined = " ".join(sqls)

    assert any("CREATE TABLE IF NOT EXISTS api.users" in s for s in sqls)
    assert any("CREATE TABLE IF NOT EXISTS api.threads" in s for s in sqls)
    assert any("CREATE TABLE IF NOT EXISTS api.messages" in s for s in sqls)
    assert "CREATE ROLE anon" in joined
    assert "CREATE ROLE web_user" in joined
    assert "CREATE ROLE authenticator" in joined
    assert "ALTER TABLE api.users ENABLE ROW LEVEL SECURITY" in joined
    assert "ALTER TABLE api.threads ENABLE ROW LEVEL SECURITY" in joined
    assert "ALTER TABLE api.messages ENABLE ROW LEVEL SECURITY" in joined
    assert "CREATE POLICY thread_access" in joined
    assert "CREATE POLICY message_access" in joined
    assert "CREATE TRIGGER update_users_updated_at" in joined
    assert "CREATE TRIGGER update_threads_updated_at" in joined


def test_bootstrap_statements_contain_no_citus():
    joined = " ".join(_sql(s) for s in BOOTSTRAP_STATEMENTS).lower()
    for needle in (
        "citus",
        "create_distributed_table",
        "create_reference_table",
        "citus_add_node",
        "pg_dist_",
    ):
        assert needle not in joined


@pytest.mark.asyncio
async def test_ensure_api_schema_runs_every_statement():
    cur = FakeCursor()
    conn = MagicMock()
    conn.cursor.return_value.__aenter__ = AsyncMock(return_value=cur)
    conn.cursor.return_value.__aexit__ = AsyncMock(return_value=None)
    pool = MagicMock()
    pool.connection.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.connection.return_value.__aexit__ = AsyncMock(return_value=None)

    await ensure_api_schema(pool)

    assert len(cur.executed) == len(BOOTSTRAP_STATEMENTS)
    assert any("CREATE TABLE IF NOT EXISTS api.users" in sql for sql in cur.executed)
    assert any("ENABLE ROW LEVEL SECURITY" in sql for sql in cur.executed)
