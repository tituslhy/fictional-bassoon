-- Create LangGraph tables (latest schema for langgraph-checkpoint-postgres)
-- We create them here but we DO NOT distribute them via Citus.
-- Reasoning: Citus has a known issue with LangGraph's correlated subqueries 
-- involving jsonb_each_text on distributed tables (InternalError: invalid attnum).
-- These remain as standard local tables on the coordinator node.

CREATE TABLE IF NOT EXISTS checkpoint_migrations (
    v INTEGER PRIMARY KEY
);

-- Insert current migration version to prevent library-led migration conflicts
INSERT INTO checkpoint_migrations (v) VALUES (0), (1), (2), (3), (4), (5), (6), (7), (8), (9) ON CONFLICT (v) DO NOTHING;

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

-- Indices for performance
CREATE INDEX IF NOT EXISTS checkpoints_thread_id_idx ON checkpoints(thread_id);
CREATE INDEX IF NOT EXISTS checkpoint_blobs_thread_id_idx ON checkpoint_blobs(thread_id);
CREATE INDEX IF NOT EXISTS checkpoint_writes_thread_id_idx ON checkpoint_writes(thread_id);

-------------------------------------------------------------------------------
-- PostgREST Integration
-------------------------------------------------------------------------------

-- 1. Create dedicated API schema
CREATE SCHEMA IF NOT EXISTS api;

-- 2. Create users table for authentication (stored in api schema)
CREATE TABLE IF NOT EXISTS api.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create roles for PostgREST
-- Use DO blocks to handle existing roles gracefully
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'web_user') THEN
    CREATE ROLE web_user NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
    -- The password here is a placeholder, it should be set via env var in docker-compose
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'authenticator_password';
  END IF;
END
$$;

-- Grant authenticator the ability to switch roles
GRANT anon TO authenticator;
GRANT web_user TO authenticator;

-- 4. Permissions
-- Schema usage
GRANT USAGE ON SCHEMA api TO anon;
GRANT USAGE ON SCHEMA api TO web_user;

-- Anonymous permissions (Signup)
GRANT INSERT ON api.users TO anon;
-- We'll allow anon to select emails only to check for existence, or keep it strictly INSERT
GRANT SELECT (id, email) ON api.users TO anon;

-- Web user permissions (own profile)
GRANT SELECT, UPDATE ON api.users TO web_user;

-- Enable Row Level Security
ALTER TABLE api.users ENABLE ROW LEVEL SECURITY;

-- Anonymous can only signup (INSERT)
CREATE POLICY anon_signup ON api.users FOR INSERT TO anon WITH CHECK (true);
-- Users can only see and update their own data
-- PostgREST will set 'request.jwt.claims' which contains our custom 'user_id'
CREATE POLICY user_self_manage ON api.users
  FOR ALL TO web_user
  USING (id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid)
  WITH CHECK (id = (current_setting('request.jwt.claims', true)::jsonb->>'user_id')::uuid);

-- 5. Helper to update 'updated_at'
CREATE OR REPLACE FUNCTION api.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON api.users FOR EACH ROW EXECUTE PROCEDURE api.update_updated_at_column();
