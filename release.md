# Local stack reliability and end-to-end verification

Date: 1 November 2026
Status: Unreleased workspace changes

This change makes authenticated chat and local Langfuse tracing usable through the running Docker stack, strengthens conversation ownership checks, and records browser evidence for the application and infrastructure dashboards. It also replaces the main agent instructions with `AGENTS.md` and adds `.codex/` project guidance.

## Application and security changes

- Added authenticated thread management through FastAPI and routed the frontend through the same-origin API proxy.
- Enforced ownership for chat, history, thread operations, and A2A execution. Added security regression coverage for unauthorized and cross-user access.
- Canonicalized thread identifiers and reserved deleted thread IDs to prevent reassignment of retained conversation data.
- Restricted direct database API access so application authorization is not bypassed through public PostgREST access.
- Closed database pools after failed bootstrap and improved provider configuration diagnostics.
- Added backend and frontend Docker ignore files to keep local dependencies and sensitive environment files out of build contexts.

## Startup and tracing

- Replaced obsolete MinIO setup commands with bounded retries and idempotent private-bucket initialization.
- Ordered Langfuse startup after storage initialization and its worker after web migrations and health checks.
- Loaded the user's provider key into the local API and worker runtime without displaying the environment file. A real OpenAI response replaced the earlier synthetic smoke response.
- Created local `user` accounts for the app and Langfuse, with viewer access to the smoke-test tracing project. Credentials remain in ignored local handoff files.
- Added loopback-only dashboard access to the isolated `bassoon-local` stack through generated local proxy configuration. The generated setup is local verification infrastructure, not a committed production deployment configuration.

## Verification evidence

The browser test sent “why is the sky blue?” from the authenticated Relay frontend. A real answer returned, conversation history persisted, and the corresponding input, output, generation, token usage, and cost appeared in Langfuse.

Pre-commit verification reran both suites: **113 backend tests** and **201 frontend tests** passed with environment-file loading disabled. Backend warnings include a short test JWT key and an unawaited test mock coroutine.

| Interface | Observed result | Screenshot |
|---|---|---|
| Relay | Real answer rendered for `user` | [App](images/app.png) |
| Langfuse | Matching chat and model generation visible | [Trace](images/langfuse.png) |
| Grafana | Request-rate and duration charts populated | [Metrics](images/grafana.png) |
| RabbitMQ | Authenticated overview with consumers and activity | [Broker](images/rabbitmq.png) |
| Redis Insight | Primary connection test succeeded; key browser populated | [Redis](images/redis.png) |
| Prometheus | All 26 scrape targets up | [Targets](images/prometheus.png) |
| MinIO | Private Langfuse bucket with event folders and 12 objects | [Storage](images/minio.png) |
| ClickHouse | Read-only query returned trace and observation tables | [Query](images/clickhouse.png) |
| Alloy | All four configured components healthy | [Components](images/alloy.png) |
| FastAPI docs | Schema and endpoints rendered through direct backend access | [Docs](images/api-docs.png) |

Screenshots overwrite their corresponding files in `images/` and are embedded in [README.md](README.md). Object counts and health results are observations from the test, not continuously monitored guarantees. Services and persisted data were left running for manual inspection.

### AG-UI over SSE

A live authenticated `POST /api/chat` returned `text/event-stream; charset=utf-8`. All **55 events** validated against the installed `ag-ui-protocol==0.1.21` Event schema; SSE event names matched payload types. The run contained start, text, A2UI CUSTOM, and finish events, matching thread/run IDs, no RUN_ERROR, and readable user/assistant history afterward.

This verifies the output stream. The request still uses `{message, thread_id}`, not the full standard RunAgentInput contract. The simple question did not exercise live tool-call or reasoning-event paths; complete compatibility with arbitrary AG-UI clients is not claimed.

### Citus status

Citus **13.0-1** reports an active coordinator and two active workers. API threads and messages are hash-distributed and colocated; users are a reference table.

The distributed LangGraph checkpoint probe still encounters `invalid attnum 6 for relation "jsonb_each_text"`. Bootstrap falls back to local `checkpoints`, `checkpoint_blobs`, and `checkpoint_writes` tables on the coordinator. Chat and persisted history work with this fallback. **The underlying distributed-checkpoint incompatibility remains unresolved**, and the originally reported whole-stack database crash was not reproduced.

The new [scripts/check_citus.sql](scripts/check_citus.sql) provides a read-only check of extension version, worker membership, table distribution, and checkpoint persistence. README contains the command for the running local stack.

## Agent guidance migration

- `AGENTS.md` is the canonical project instruction file, with current local ports, environment-file restrictions, runtime preservation guidance, and verification limitations.
- `CLAUDE.md` now points to `AGENTS.md` for compatibility with existing Claude workflows.
- `.codex/rules/` contains the project architecture and protocol rules; `.codex/agents/` contains adapted reference role briefs.
- `.codex/README.md` explains explicit rule loading and reuse of existing skills. Role briefs are not registered agents, and Claude/Cursor lifecycle hooks and permissions are not represented as active Codex settings.
- Removed migration checklists are not recreated by the new guidance.

## Remaining limitations

- Distributed checkpoint compatibility needs a separate fix and verification; local fallback is currently required.
- Grafana's log panel has no data. Healthy Alloy components alone do not prove log delivery.
- `/api/docs` cannot fetch its schema through the frontend prefix; use the direct backend docs URL in README.
- Switching accounts can leave a stale selected thread, causing the next message to return 404 until a new chat is selected.
- These checks do not establish production readiness, full failover behavior, or every protocol capability.

## Review and operation

See README's verified local-run section for ports and screenshots. Local credentials and generated configuration remain under ignored `handoffs/local-stack/`. Preserve the provider override when recreating API/worker containers. Do not remove volumes or stop the running stack unless requested.

This release note accompanies the committed change set. No version tag or production deployment is included.
