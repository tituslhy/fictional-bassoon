import logging

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
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      thread_id UUID NOT NULL REFERENCES api.threads(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      reasoning TEXT,
      tool_calls JSONB DEFAULT '[]'::jsonb,
      status TEXT DEFAULT 'done' CHECK (status IN ('streaming', 'done', 'error')),
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
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
      IF NOT EXISTS (
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
      IF NOT EXISTS (
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
      IF NOT EXISTS (
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


async def ensure_api_schema(pool) -> None:
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            for statement in BOOTSTRAP_STATEMENTS:
                await cur.execute(statement)
    logger.info("ensured api schema bootstrap")
