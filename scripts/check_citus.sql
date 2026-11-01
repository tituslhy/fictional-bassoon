-- Read-only inspection: membership, distribution, and checkpoint persistence.
BEGIN READ ONLY;
SELECT extversion AS citus_version FROM pg_extension WHERE extname = 'citus';
SELECT nodename, nodeport, isactive FROM pg_dist_node ORDER BY nodename;
SELECT logicalrelid::regclass AS relation, partmethod, colocationid
FROM pg_dist_partition ORDER BY 1;
SELECT c.relname,
       EXISTS (SELECT 1 FROM pg_dist_partition p WHERE p.logicalrelid = c.oid) AS distributed
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('checkpoints', 'checkpoint_blobs', 'checkpoint_writes')
ORDER BY c.relname;
SELECT count(*) AS persisted_checkpoints FROM checkpoints;
COMMIT;
