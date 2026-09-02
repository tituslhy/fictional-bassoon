import logging
import os

logger = logging.getLogger("backend")


BOOTSTRAP_STATEMENTS = [
    "CREATE EXTENSION IF NOT EXISTS pgcrypto",
    "CREATE SCHEMA IF NOT EXISTS api",
    """
    CREATE TABLE IF NOT EXISTS api.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS api.threads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES api.users(id) ON DELETE CASCADE,
      title TEXT DEFAULT 'New Thread',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS api.messages (
      id UUID NOT NULL DEFAULT gen_random_uuid(),
      thread_id UUID NOT NULL REFERENCES api.threads(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      reasoning TEXT,
      tool_calls JSONB DEFAULT '[]'::jsonb,
      status TEXT DEFAULT 'done' CHECK (status IN ('streaming', 'done', 'error')),
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (thread_id, id)
    )
    """,
    """
    CREATE OR REPLACE FUNCTION api.update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = now();
        RETURN NEW;
    END;
    $$ language 'plpgsql'
    """,
    """
    DO $$
    BEGIN
      -- Citus 13 rejects row triggers on reference/distributed tables.
      IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citus') THEN
        NULL;
      ELSIF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_users_updated_at'
          AND tgrelid = 'api.users'::regclass
      ) THEN
        CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON api.users
        FOR EACH ROW
        EXECUTE PROCEDURE api.update_updated_at_column();
      END IF;
    END
    $$;
    """,
    """
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citus') THEN
        NULL;
      ELSIF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_threads_updated_at'
          AND tgrelid = 'api.threads'::regclass
      ) THEN
        CREATE TRIGGER update_threads_updated_at
        BEFORE UPDATE ON api.threads
        FOR EACH ROW
        EXECUTE PROCEDURE api.update_updated_at_column();
      END IF;
    END
    $$;
    """,
    """
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'web_user') THEN
        CREATE ROLE web_user NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
        CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'authenticator_password';
      END IF;
    END
    $$;
    """,
    "GRANT anon TO authenticator",
    "GRANT web_user TO authenticator",
    "GRANT USAGE ON SCHEMA api TO anon",
    "GRANT USAGE ON SCHEMA api TO web_user",
    "GRANT INSERT ON api.users TO anon",
    "GRANT SELECT (id, email) ON api.users TO anon",
    "GRANT SELECT, UPDATE ON api.users TO web_user",
    "GRANT ALL ON api.threads TO web_user",
    "GRANT ALL ON api.messages TO web_user",
    "ALTER TABLE api.users ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE api.threads ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE api.messages ENABLE ROW LEVEL SECURITY",
    """
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'api'
          AND tablename = 'users'
          AND policyname = 'anon_signup'
      ) THEN
        CREATE POLICY anon_signup ON api.users
        FOR INSERT TO anon
        WITH CHECK (true);
      END IF;
    END
    $$;
    """,
    """
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'api'
          AND tablename = 'users'
          AND policyname = 'user_self_manage'
      ) THEN
        CREATE POLICY user_self_manage ON api.users
          FOR ALL TO web_user
          USING (id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid)
          WITH CHECK (id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid);
      END IF;
    END
    $$;
    """,
    """
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'api'
          AND tablename = 'threads'
          AND policyname = 'thread_access'
      ) THEN
        CREATE POLICY thread_access ON api.threads
          FOR ALL TO web_user
          USING (user_id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid)
          WITH CHECK (user_id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid);
      END IF;
    END
    $$;
    """,
    """
    DO $$
    BEGIN
      -- Citus 13 rejects this EXISTS/SubLink policy on distributed api.messages.
      -- api.messages is unused by PostgREST (history hydrates from the checkpointer).
      IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citus') THEN
        NULL;
      ELSIF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'api'
          AND tablename = 'messages'
          AND policyname = 'message_access'
      ) THEN
        CREATE POLICY message_access ON api.messages
          FOR ALL TO web_user
          USING (
            EXISTS (
              SELECT 1 FROM api.threads
              WHERE api.threads.id = api.messages.thread_id
              AND api.threads.user_id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid
            )
          )
          WITH CHECK (
            EXISTS (
              SELECT 1 FROM api.threads
              WHERE api.threads.id = api.messages.thread_id
              AND api.threads.user_id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid
            )
          );
      END IF;
    END
    $$;
    """,
]


def parse_citus_worker_nodes(raw: str) -> list[tuple[str, int]]:
    """Parse ``host:port,host:port`` from ``CITUS_WORKER_NODES``."""
    nodes: list[tuple[str, int]] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        host, port_s = part.rsplit(":", 1)
        nodes.append((host.strip(), int(port_s)))
    return nodes


async def _extension_present(cur, name: str) -> bool:
    await cur.execute("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = %s)", (name,))
    row = await cur.fetchone()
    return bool(row and row[0])


async def _relation_is_distributed(cur, qualified: str) -> bool:
    await cur.execute(
        "SELECT EXISTS (SELECT 1 FROM pg_dist_partition WHERE logicalrelid = %s::regclass)",
        (qualified,),
    )
    row = await cur.fetchone()
    return bool(row and row[0])


async def _relation_exists(cur, qualified: str) -> bool:
    await cur.execute("SELECT to_regclass(%s) IS NOT NULL", (qualified,))
    row = await cur.fetchone()
    return bool(row and row[0])


async def _messages_primary_key_columns(cur) -> list[str]:
    await cur.execute(
        """
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'api.messages'::regclass
          AND i.indisprimary
        ORDER BY array_position(i.indkey, a.attnum)
        """
    )
    rows = await cur.fetchall()
    return [r[0] for r in rows]


async def _ensure_messages_pkey_includes_thread_id(cur) -> None:
    """Citus unique/PK constraints must include the distribution column."""
    cols = await _messages_primary_key_columns(cur)
    if cols == ["thread_id", "id"]:
        return
    if cols == ["id"]:
        await cur.execute("ALTER TABLE api.messages DROP CONSTRAINT messages_pkey")
        await cur.execute("ALTER TABLE api.messages ADD PRIMARY KEY (thread_id, id)")
        logger.info("migrated api.messages primary key to (thread_id, id) for Citus")
        return
    if cols:
        logger.warning("api.messages primary key columns %s; not migrating automatically", cols)


async def _constraint_exists(cur, table: str, name: str) -> bool:
    await cur.execute(
        """
        SELECT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = %s AND conrelid = %s::regclass
        )
        """,
        (name, table),
    )
    row = await cur.fetchone()
    return bool(row and row[0])


async def _policy_exists(cur, table: str, name: str) -> bool:
    schema, _, rel = table.partition(".")
    await cur.execute(
        """
        SELECT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = %s AND tablename = %s AND policyname = %s
        )
        """,
        (schema, rel, name),
    )
    row = await cur.fetchone()
    return bool(row and row[0])


async def _drop_citus_distribution_blockers(cur) -> None:
    """Citus 13 cannot convert tables that still have triggers, RLS policies, or FKs."""
    await cur.execute("DROP TRIGGER IF EXISTS update_users_updated_at ON api.users")
    await cur.execute("DROP TRIGGER IF EXISTS update_threads_updated_at ON api.threads")
    for table, policy in (
        ("api.users", "anon_signup"),
        ("api.users", "user_self_manage"),
        ("api.threads", "thread_access"),
        ("api.messages", "message_access"),
    ):
        await cur.execute(f"DROP POLICY IF EXISTS {policy} ON {table}")
    for table in ("api.users", "api.threads", "api.messages"):
        await cur.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    await cur.execute("ALTER TABLE api.messages DROP CONSTRAINT IF EXISTS messages_thread_id_fkey")
    await cur.execute("ALTER TABLE api.threads DROP CONSTRAINT IF EXISTS threads_user_id_fkey")
    logger.info("dropped triggers, RLS policies, and FKs that block Citus distribution")


async def _restore_after_citus_distribution(cur) -> None:
    """Re-apply FKs and Citus-safe RLS. Row triggers are not supported on Citus tables."""
    if not await _constraint_exists(cur, "api.threads", "threads_user_id_fkey"):
        await cur.execute(
            """
            ALTER TABLE api.threads
            ADD CONSTRAINT threads_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES api.users(id) ON DELETE CASCADE
            """
        )
    if not await _constraint_exists(cur, "api.messages", "messages_thread_id_fkey"):
        await cur.execute(
            """
            ALTER TABLE api.messages
            ADD CONSTRAINT messages_thread_id_fkey
            FOREIGN KEY (thread_id) REFERENCES api.threads(id) ON DELETE CASCADE
            """
        )

    for table in ("api.users", "api.threads", "api.messages"):
        await cur.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

    if not await _policy_exists(cur, "api.users", "anon_signup"):
        await cur.execute(
            """
            CREATE POLICY anon_signup ON api.users
            FOR INSERT TO anon
            WITH CHECK (true)
            """
        )
    if not await _policy_exists(cur, "api.users", "user_self_manage"):
        await cur.execute(
            """
            CREATE POLICY user_self_manage ON api.users
            FOR ALL TO web_user
            USING (id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid)
            WITH CHECK (id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid)
            """
        )
    if not await _policy_exists(cur, "api.threads", "thread_access"):
        await cur.execute(
            """
            CREATE POLICY thread_access ON api.threads
            FOR ALL TO web_user
            USING (user_id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid)
            WITH CHECK (user_id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid)
            """
        )
    logger.info(
        "restored FKs and RLS on Citus tables; skipped row triggers and "
        "api.messages EXISTS policy (unsupported on Citus 13)"
    )


async def _enable_coordinator_shards_if_no_workers(cur) -> None:
    """Distributed tables need at least one shard-host; the coordinator can be one."""
    await cur.execute("SELECT count(*) FROM pg_dist_node WHERE groupid <> 0")
    row = await cur.fetchone()
    worker_count = int(row[0]) if row else 0
    if worker_count:
        return
    await cur.execute("UPDATE pg_dist_node SET shouldhaveshards = true WHERE groupid = 0")
    logger.info("no citus workers; enabling shards on the coordinator")


async def _ensure_citus_sharding(cur) -> None:
    """Register workers and distribute tables. No-op without the Citus extension.

    ``api.users`` is a reference table (replicated) so ``api.threads.user_id``
    can keep its FK. ``api.threads`` is distributed by ``id`` (the thread_id
    shard key); ``api.messages`` is colocated on ``thread_id``.

    Citus 13.0 cannot convert tables that still have row triggers, RLS
    policies, or FKs (init.sql installs all three). Those are dropped,
    tables are distributed, then FKs and Citus-safe policies are restored.
    Row triggers and the ``message_access`` EXISTS policy are not restored —
    Citus rejects them on distributed/reference tables.

    LangGraph checkpoint tables are distributed by ``thread_id`` and colocated
    with each other. That re-enables the historical Citus/``jsonb_each_text``
    risk; a failure here is logged and those tables stay local rather than
    taking down API schema bootstrap.
    """
    if not await _extension_present(cur, "citus"):
        logger.info("citus extension not present; skipping cluster setup")
        return

    coordinator_host = os.getenv("CITUS_COORDINATOR_HOST", "citus_coordinator")
    coordinator_port = int(os.getenv("CITUS_COORDINATOR_PORT", "5432"))
    await cur.execute(
        "SELECT citus_set_coordinator_host(%s, %s)",
        (coordinator_host, coordinator_port),
    )

    workers = parse_citus_worker_nodes(os.getenv("CITUS_WORKER_NODES", ""))
    if not workers:
        logger.info("CITUS_WORKER_NODES unset; not registering workers")
    else:
        await cur.execute("SELECT nodename, nodeport FROM pg_dist_node WHERE groupid <> 0")
        existing = {(row[0], int(row[1])) for row in await cur.fetchall()}
        for host, port in workers:
            if (host, port) in existing:
                continue
            await cur.execute("SELECT citus_add_node(%s, %s)", (host, port))
            logger.info("registered citus worker %s:%s", host, port)

    await _enable_coordinator_shards_if_no_workers(cur)
    await _ensure_messages_pkey_includes_thread_id(cur)

    needs_distribute = not (
        await _relation_is_distributed(cur, "api.users")
        and await _relation_is_distributed(cur, "api.threads")
        and await _relation_is_distributed(cur, "api.messages")
    )
    if needs_distribute:
        await _drop_citus_distribution_blockers(cur)

    if not await _relation_is_distributed(cur, "api.users"):
        await cur.execute("SELECT create_reference_table('api.users')")
        logger.info("created citus reference table api.users")

    if not await _relation_is_distributed(cur, "api.threads"):
        await cur.execute("SELECT create_distributed_table('api.threads', 'id')")
        logger.info("distributed api.threads by id")

    if not await _relation_is_distributed(cur, "api.messages"):
        await cur.execute(
            "SELECT create_distributed_table('api.messages', 'thread_id', colocate_with => 'api.threads')"
        )
        logger.info("distributed api.messages by thread_id (colocated with api.threads)")

    if needs_distribute:
        await _restore_after_citus_distribution(cur)

    await _try_distribute_checkpoint_tables(cur)


async def _try_distribute_checkpoint_tables(cur) -> None:
    """Colocate LangGraph checkpoint tables on thread_id; keep them local on error."""
    checkpoint_tables = (
        ("checkpoints", "none"),
        ("checkpoint_blobs", "checkpoints"),
        ("checkpoint_writes", "checkpoints"),
    )
    for table, colocate_with in checkpoint_tables:
        if not await _relation_exists(cur, table):
            logger.info("%s not present; skipping citus distribution", table)
            return
        if await _relation_is_distributed(cur, table):
            continue
        try:
            if colocate_with == "none":
                await cur.execute(
                    "SELECT create_distributed_table(%s, 'thread_id', colocate_with => 'none')",
                    (table,),
                )
            else:
                await cur.execute(
                    "SELECT create_distributed_table(%s, 'thread_id', colocate_with => %s)",
                    (table, colocate_with),
                )
            logger.info("distributed %s by thread_id", table)
        except Exception:
            logger.exception(
                "failed to distribute %s (likely Citus/LangGraph jsonb_each_text); "
                "leaving remaining checkpoint tables local on the coordinator",
                table,
            )
            return


async def ensure_api_schema(pool) -> None:
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            for statement in BOOTSTRAP_STATEMENTS:
                await cur.execute(statement)
            await _ensure_citus_sharding(cur)
    logger.info("ensured api schema bootstrap")
