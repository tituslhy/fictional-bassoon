-- First-boot schema for a single PostgreSQL 16 instance.
-- FastAPI also runs the same statements idempotently in
-- backend/src/db_bootstrap.py on every startup.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-------------------------------------------------------------------------------
-- LangGraph checkpointer (public schema)
-------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS checkpoint_migrations (
    v INTEGER PRIMARY KEY
);

INSERT INTO checkpoint_migrations (v)
VALUES (0), (1), (2), (3), (4), (5), (6), (7), (8), (9)
ON CONFLICT (v) DO NOTHING;

CREATE TABLE IF NOT EXISTS checkpoints (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    parent_checkpoint_id TEXT,
    type TEXT,
    checkpoint JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS checkpoint_blobs (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL,
    version TEXT NOT NULL,
    type TEXT NOT NULL,
    blob BYTEA,
    PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);

CREATE TABLE IF NOT EXISTS checkpoint_writes (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    task_path TEXT NOT NULL DEFAULT '',
    idx INTEGER NOT NULL,
    channel TEXT NOT NULL,
    type TEXT,
    blob BYTEA NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

CREATE INDEX IF NOT EXISTS checkpoints_thread_id_idx ON checkpoints(thread_id);
CREATE INDEX IF NOT EXISTS checkpoint_blobs_thread_id_idx ON checkpoint_blobs(thread_id);
CREATE INDEX IF NOT EXISTS checkpoint_writes_thread_id_idx ON checkpoint_writes(thread_id);

-------------------------------------------------------------------------------
-- PostgREST API schema (roles, grants, RLS)
-- Unchanged from the Citus-era contract: PostgREST still speaks schema
-- `api` as authenticator, switching to anon / web_user via JWT.
-------------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS api;

CREATE TABLE IF NOT EXISTS api.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api.threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES api.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'New Thread',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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
);

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

GRANT anon TO authenticator;
GRANT web_user TO authenticator;

GRANT USAGE ON SCHEMA api TO anon;
GRANT USAGE ON SCHEMA api TO web_user;

GRANT INSERT ON api.users TO anon;
GRANT SELECT (id, email) ON api.users TO anon;

GRANT SELECT, UPDATE ON api.users TO web_user;
GRANT ALL ON api.threads TO web_user;
GRANT ALL ON api.messages TO web_user;

ALTER TABLE api.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE api.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_signup ON api.users FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY user_self_manage ON api.users
  FOR ALL TO web_user
  USING (id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid)
  WITH CHECK (id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid);

CREATE POLICY thread_access ON api.threads
  FOR ALL TO web_user
  USING (user_id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid)
  WITH CHECK (user_id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid);

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

CREATE OR REPLACE FUNCTION api.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON api.users
  FOR EACH ROW EXECUTE PROCEDURE api.update_updated_at_column();

CREATE TRIGGER update_threads_updated_at
  BEFORE UPDATE ON api.threads
  FOR EACH ROW EXECUTE PROCEDURE api.update_updated_at_column();
