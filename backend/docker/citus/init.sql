-- Create LangGraph tables (based on standard AsyncPostgresSaver schema)
-- We create them here so we can distribute them immediately on startup

CREATE TABLE IF NOT EXISTS checkpoints (
    thread_id TEXT NOT NULL,
    checkpoint_id TEXT NOT NULL,
    parent_id TEXT,
    checkpoint BYTEA NOT NULL,
    metadata BYTEA NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS checkpoint_blobs (
    thread_id TEXT NOT NULL,
    checkpoint_id TEXT NOT NULL,
    blob_id TEXT NOT NULL,
    blob BYTEA NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_id, blob_id)
);

CREATE TABLE IF NOT EXISTS checkpoint_writes (
    thread_id TEXT NOT NULL,
    checkpoint_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    channel TEXT NOT NULL,
    value BYTEA NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_id, task_id, idx)
);

-- Distribute tables by thread_id
-- This ensures all data for a specific chat thread lives on the same worker node
SELECT create_distributed_table('checkpoints', 'thread_id');
SELECT create_distributed_table('checkpoint_blobs', 'thread_id');
SELECT create_distributed_table('checkpoint_writes', 'thread_id');
