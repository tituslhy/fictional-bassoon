# Field tests — local laptop only

**Do not run this in the cloud.** This environment does not have your
OpenAI / Tavily keys, and live LLM + search rounds are the point of the
checklist. Do it on your machine after `make up` with `backend/.env`
populated.

These are **manual** checks. Automated unit tests cover the same seams
with mocks; they are not a substitute for a live round-trip.

## Still pending (laptop)

A cloud agent bring-up (2026-09-02) cleared the pieces that do not need
API keys. It could **not** run a live model round, and the old 45-container
`make up` failed in nested Docker (RabbitMQ alpine died on vfs). The stack
is now 14 pinned-tag containers (single Postgres, no Citus / Langfuse /
ClickHouse / MinIO / Sentinel).

Still yours after `make up-build` with real keys:

- **§1** live search turn: CUSTOM `name: a2ui` on `/chat`, distinct
  reasoning / tool_call / markdown blocks, last CUSTOM has
  `streaming: false`. Empty-state copy ("How can I help?", Relay chrome)
  already checked.
- **§2** hydrate of that turn: refresh paints **user + assistant + tool
  cards** from `GET /threads/{id}/history`. User-turn-only history GET
  and PostgREST catalog (no `messages(*)`) already checked.
- **§3** blinking cursor only on the in-progress assistant bubble
  (needs a second live stream on a thread that already has a completed
  reply).
- **§5** checkpoint row from a **successful** chat. Workers +
  `pg_dist_partition` (`api.users` reference, `api.threads` /
  `api.messages` distributed) already checked; LangGraph checkpoints
  stayed local after the `jsonb_each_text` canary — confirm a live turn
  still writes a `checkpoints` row.
- **§6** GitHub file view paints the root README mermaid (source has no
  known breakers; the rendered GitHub glance was not clicked).
- **Full compose** — nginx `:80`, single Postgres + PgBouncer + PostgREST,
  one Redis, one RabbitMQ, LGTM, FastAPI, Celery, Next.js. LangSmith is
  cloud-side (no local container).

Already passed in that bring-up (do not re-prove unless you want to):

- **§4** idle timeout — SSE `RUN_ERROR` `Worker idle timeout: no events
  for 120s` at ~120s with the worker stopped; composer unlocked after a
  401 as well.

## 0. Bring the stack up

```bash
# from repo root, with backend/.env containing OPENAI_API_KEY and TAVILY_API_KEY
make up-build
# Chat UI: http://localhost:3000  (or http://localhost via nginx)
```

Sign up a fresh account (or log in). Keep the browser devtools Network
tab open on `/api/chat` and `/api/threads/.../history`.

---

## 1. Chat UI blocks (A2UI over the wire)

Goal: the agent returns UI as JSON, and the frontend renders allow-listed
blocks — not a wall of raw markdown.

1. Start a **new chat**. Empty state should read as a product ("How can I
   help?"), not a repo demo named fictional-bassoon.
2. Ask something that **must** search, e.g.
   `What's the latest news about LangGraph checkpointing? Search for it.`
3. While the reply is in flight you should see, as **distinct UI blocks**:
   - a collapsible **reasoning** block (if the model emits thinking tokens)
   - one or more **tool_call** cards (`tavily_search` or similar) with
     arguments / result
   - a **markdown** answer with a blinking cursor **only on this bubble**
4. In Network → the `/chat` SSE stream, confirm frames:
   - `event: TEXT_MESSAGE_*` / `REASONING_*` / `TOOL_CALL_*` still present
     (A2A depends on them)
   - `event: CUSTOM` with `data` JSON `{ "type": "CUSTOM", "name": "a2ui", "value": { "component": "column", ... } }`
   - `value` children are only `column` | `reasoning` | `tool_call` | `markdown`
   - last CUSTOM before `RUN_FINISHED` has markdown `streaming: false`
5. Expand / collapse reasoning and a tool card. Nothing the agent sent
   should execute as HTML or script.

**Fail if:** no CUSTOM frames; or the answer is plain text with no tool
card on a search question; or historical bubbles also grow a cursor
(that's §3).

---

## 2. Checkpointer hydrate (source of truth)

Goal: refresh / another tab / re-select paints what the agent will use
on the next turn — the LangGraph checkpoint — not `api.messages`.

1. In the thread from §1, refresh the page (or open the same account in
   a private window, log in, click the thread).
2. The transcript must include **your user turns and the assistant
   reply**, including tool cards. Reasoning tokens from the live stream
   **will not** come back (checkpointer stores completed messages).
3. Devtools: `GET /api/threads/{id}/history` → 200,
   `{ "messages": [ ... ] }` with camelCase `toolCalls`.
4. Catalog fetch is still PostgREST `GET /threads?select=id,title,updated_at`
   — **no** `messages(*)`.
5. Same-tab: click another thread, click back. In-memory state is fine
   (no required refetch). Kill the tab, reopen, select the thread —
   history GET runs again.

**Fail if:** refresh shows only assistant rows, or an empty thread, or
the UI still POSTs `/messages` on send.

---

## 3. Streaming cursor only on the in-progress message

1. In a thread that already has at least one completed assistant reply,
   send a new message.
2. While the new reply streams, **only that** assistant bubble has the
   blinking cursor. Older assistant answers stay still. User bubbles
   never get a cursor.

**Fail if:** every historical assistant answer grows a cursor.

---

## 4. `/chat` idle timeout + composer unlock (optional / destructive)

Skip if you don't want to kill a worker. Same 120s bound as A2A
(`IDLE_TIMEOUT_SECONDS`).

1. Send a chat message, then **stop the Celery worker** before it
   publishes anything (`docker compose stop celery_worker` or kill the
   local worker).
2. Within ~120s the SSE should end with `event: RUN_ERROR`
   (`Worker idle timeout...`). The composer must accept a new send
   (not look enabled while `handleSend` no-ops).

**Fail if:** the stream hangs past 120s, or the input stays locked after
the connection closes.

---

## 5. Postgres is a single node (PostgREST still works)

On the compose service `postgres` (db from `POSTGRES_DB`):

```sql
SELECT extname FROM pg_extension;           -- pgcrypto present
SELECT nspname FROM pg_namespace WHERE nspname = 'api';
SELECT tablename FROM pg_tables WHERE schemaname = 'api' ORDER BY 1;
-- expect messages, threads, users

SELECT rolname FROM pg_roles
WHERE rolname IN ('anon', 'web_user', 'authenticator');
-- expect all three (PostgREST contract unchanged)
```

Then send one chat message and confirm a new checkpoint row exists
(`SELECT thread_id FROM checkpoints ORDER BY checkpoint_id DESC LIMIT 5`).

Backend logs on first boot: `ensured api schema bootstrap`. PostgREST
on `:3002` (or `/api/db/` via nginx) should list the `api` schema —
`GET /threads` with a JWT still works; Citus no longer disables RLS
on threads/messages.

**Fail if:** `api` schema or the three PostgREST roles are missing, or
PostgREST returns 503 / connection errors after `make up`.

---

## 6. README mermaid glance

Open the GitHub file view (or a local mermaid preview) for:

- root `README.md` — Architecture `graph LR` and the chat-stream
  `sequenceDiagram` both paint
- `frontend/README.md` / `backend/README.md` mermaid blocks still parse

**Fail if:** GitHub shows a mermaid error instead of the architecture
picture. Do not "fix" by deleting services from the diagram.

---

## Sign-off

Tick on your laptop, not in CI. `(cloud)` means the 2026-09-02 bring-up
already saw it; still re-tick if you want it on your machine.

- [ ] §1 UI blocks + CUSTOM `name: a2ui` on `/chat` — **pending** (needs keys)
- [ ] §2 hydrate assistant + tool cards after refresh — **pending** (user-turn GET 200 in cloud)
- [ ] §3 cursor only on the in-progress assistant bubble — **pending**
- [x] §4 idle timeout — **passed in cloud** (re-tick on laptop if you kill a worker)
- [ ] §5 single Postgres + PostgREST roles / `api` schema — **pending** (live checkpoint write still pending)
- [ ] §6 mermaid renders on GitHub — **pending** (source inspected only)
