# Graph Report - fictional-bassoon  (2026-08-16)

## Corpus Check
- 108 files · ~67,663 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 464 nodes · 728 edges · 41 communities (31 shown, 10 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 1% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.73)
- Token cost: 373,636 input · 0 output

## Community Hubs (Navigation)
- Frontend App Layout & Pages
- LangGraph Agent Construction
- FastAPI SSE Chat Endpoint
- Frontend Lint/Test Tooling
- Backend Architecture Rules
- Observability Stack Config
- TypeScript Compiler Config
- Redis Pub/Sub Streaming
- Frontend Package Dependencies
- Streaming Event Tests
- Code Quality Checker Tool
- PR Analyzer Tool
- Review Report Generator Tool
- Celery Worker & Metrics
- Streaming Renderer UI Component
- Prettier Formatting Config
- Chat UI Screenshot (app.png)
- LangSmith Trace Screenshot
- GitHub Autofix Skill Docs
- Agent Construction Tests
- Main Endpoint Tests
- Code Reviewer Reference Docs
- ESLint Config
- PostCSS Config
- CodeRabbit CLI Skill
- Serena Project Config
- Next.js Config (mjs)
- Next.js Config (ts)
- Tailwind Config
- Grafana Dashboard Screenshot
- RedisInsight Screenshot
- Project Root (fictional-bassoon)

## God Nodes (most connected - your core abstractions)
1. `ChatRequest` - 19 edges
2. `backend/docker-compose.yaml (full backend stack)` - 17 edges
3. `compilerOptions` - 16 edges
4. `run_agent_and_stream()` - 14 edges
5. `useAuth()` - 13 edges
6. `README.md (project root)` - 13 edges
7. `run_agent_task()` - 11 edges
8. `Prometheus scrape config (prometheus.yaml)` - 11 edges
9. `get_db_pool()` - 10 edges
10. `publish_event()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `TSX Path Review Instructions (SSE/WebSocket UX, state mgmt)` --semantically_similar_to--> `Frontend Standards Document`  [INFERRED] [semantically similar]
  .coderabbit.yaml → .claude/rules/frontend.md
- `Frontend Grading Rubric (SSE integration, type safety, reasoning UI, state mgmt, streaming resilience)` --semantically_similar_to--> `Frontend Standards Document`  [INFERRED] [semantically similar]
  .gemini/agents/frontend_architect.md → .claude/rules/frontend.md
- `Frontend Hooks (ESLint, Prettier, tsc, vitest)` --semantically_similar_to--> `Frontend Standards Document`  [INFERRED] [semantically similar]
  .pre-commit-config.yaml → .claude/rules/frontend.md
- `Backend Grading Rubric (thin entry point, logic separation, streaming compliance, Pydantic, worker sync/async bridge)` --semantically_similar_to--> `Architecture Rules (backend request/worker flow)`  [INFERRED] [semantically similar]
  .gemini/agents/backend_architect.md → .claude/rules/architecture.md
- `Python Path Review Instructions (async, FastAPI, SSE streaming)` --semantically_similar_to--> `LangGraph Streaming Patterns Document`  [INFERRED] [semantically similar]
  .coderabbit.yaml → .claude/rules/streaming-patterns.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CodeRabbit-based code review skill family (three parallel implementations)** — _agents_skills_autofix_skill_coderabbit_autofix, _agents_skills_code_review_skill_coderabbit_code_review, _claude_skills_code_reviewer_skill_code_reviewer [INFERRED 0.75]
- **SSE streaming pipeline governance rules (backend architecture, LangGraph contract, frontend consumption)** — _claude_rules_architecture_doc, _claude_rules_streaming_patterns_doc, _claude_rules_frontend_doc [INFERRED 0.85]
- **Parallel Gemini agent rubrics duplicating Claude rule docs** — _gemini_agents_backend_architect_agent, _gemini_agents_frontend_architect_agent, _claude_rules_architecture_doc, _claude_rules_frontend_doc [INFERRED 0.75]
- **AI-assistant project context documentation set** — claude_md_claude_md, gemini_md_gemini_md, readme_readme, backend_readme_readme, frontend_readme_readme [INFERRED 0.80]
- **LGTM observability stack configuration group** — concept_lgtm_monitoring_stack, backend_docker_monitoring_prometheus_prometheus_scrapeconfig, backend_docker_monitoring_loki_loki_config_config, backend_docker_monitoring_tempo_tempo_config, backend_docker_monitoring_grafana_provisioning_datasources_datasources_provisioning [EXTRACTED 1.00]
- **Unified Docker Compose orchestration** — docker_docker_compose_stack, backend_docker_compose_stack, frontend_docker_compose_stack, concept_nginx_reverse_proxy [EXTRACTED 1.00]

## Communities (41 total, 10 thin omitted)

### Community 0 - "Frontend App Layout & Pages"
Cohesion: 0.08
Nodes (38): inter, metadata, LoginPage(), Home(), SignupPage(), Chat(), MessageBubble(), MessageBubbleProps (+30 more)

### Community 1 - "LangGraph Agent Construction"
Cohesion: 0.07
Nodes (40): AsyncConnectionPool, create_agent(), get_agent(), Agent construction module. Constructs the shared CompiledStateGraph lazily., Create a new agent instance with the given checkpointer., Return an agent instance, initializing a checkpointer if needed. Lifecycle…, ChatRequest, HealthResponse (+32 more)

### Community 2 - "FastAPI SSE Chat Endpoint"
Cohesion: 0.10
Nodes (34): chat(), health(), lifespan(), login(), FastAPI application with SSE chat and health endpoints., Stream agent events via SSE. Enqueues a Celery task to run the agent, then…, Health check endpoint with Redis connectivity check., Create a new user account. (+26 more)

### Community 3 - "Frontend Lint/Test Tooling"
Cohesion: 0.06
Nodes (35): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, jsdom, postcss, prettier (+27 more)

### Community 4 - "Backend Architecture Rules"
Cohesion: 0.08
Nodes (29): src/agent.py responsibility (module-level agent construction), Architecture Rules (backend request/worker flow), main.py responsibility (thin FastAPI entrypoint), src/models.py responsibility (Pydantic models only), src/redis_pubsub.py responsibility (publish_event/subscribe helpers), Request Flow (POST /chat -> Celery -> Redis pubsub -> SSE), src/streaming.py responsibility (LangGraph event conversion), Worker Flow (run_agent_task -> LangGraph astream -> publish_event) (+21 more)

### Community 5 - "Observability Stack Config"
Cohesion: 0.23
Nodes (25): backend/docker-compose.yaml (full backend stack), Grafana dashboards provisioning config, Grafana datasources provisioning config, Loki config (loki-config.yaml), Prometheus scrape config (prometheus.yaml), Tempo config (tempo.yaml), Celery worker (async agent execution), Citus distributed Postgres cluster (+17 more)

### Community 6 - "TypeScript Compiler Config"
Cohesion: 0.07
Nodes (27): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+19 more)

### Community 7 - "Redis Pub/Sub Streaming"
Cohesion: 0.14
Nodes (23): get_redis_client(), get_redis_connection(), _get_sentinel_nodes(), publish_event(), Redis pub/sub helpers for streaming agent events between worker and FastAPI., Create a new Redis client for the current event loop., Context manager to get a Redis connection and ensure it is closed., Publish a single SSE event dict to the ``stream:{job_id}`` channel. Args:… (+15 more)

### Community 8 - "Frontend Package Dependencies"
Cohesion: 0.08
Nodes (25): dependencies, lucide-react, next, react, react-dom, react-markdown, remark-gfm, next (+17 more)

### Community 9 - "Streaming Event Tests"
Cohesion: 0.19
Nodes (14): AIMessageChunk, AnyMessage, asyncio, test_stream_agent_events_basic(), test_stream_agent_events_error(), _extract_tool_call_info(), _handle_completed_message(), _handle_message_chunk() (+6 more)

### Community 10 - "Code Quality Checker Tool"
Cohesion: 0.21
Nodes (7): CodeQualityChecker, main(), Main class for code quality checker functionality, Execute the main functionality, Validate the target path exists and is accessible, Perform the main analysis or operation, Generate and display the report

### Community 11 - "PR Analyzer Tool"
Cohesion: 0.21
Nodes (7): main(), PrAnalyzer, Main class for pr analyzer functionality, Execute the main functionality, Validate the target path exists and is accessible, Perform the main analysis or operation, Generate and display the report

### Community 12 - "Review Report Generator Tool"
Cohesion: 0.21
Nodes (7): main(), Main class for review report generator functionality, Execute the main functionality, Validate the target path exists and is accessible, Perform the main analysis or operation, Generate and display the report, ReviewReportGenerator

### Community 13 - "Celery Worker & Metrics"
Cohesion: 0.29
Nodes (8): Celery app configuration for the deep agent background worker., Start a small HTTP server to export Prometheus metrics from the worker., start_metrics_server(), test_start_metrics_server(), test_start_metrics_server_default(), test_start_metrics_server_error(), connect, RabbitMQ Management UI Overview Dashboard

### Community 14 - "Streaming Renderer UI Component"
Cohesion: 0.27
Nodes (4): MarkdownSection(), StreamingRenderer(), StreamingRendererProps, ToolCall

### Community 15 - "Prettier Formatting Config"
Cohesion: 0.25
Nodes (7): arrowParens, printWidth, semi, singleQuote, tabWidth, trailingComma, useTabs

### Community 16 - "Chat UI Screenshot (app.png)"
Cohesion: 0.43
Nodes (7): Quantum Computing x Generative AI Research Query (demo content), Streamed Answer Message with Markdown Formatting, Chat Input Box with Disclaimer Footer, Fictional Bassoon Chat UI Screenshot, Collapsible tavily_search Tool Call UI Element, Thread Sidebar with New Thread Button and Thread List, User Message Bubble (Right-Aligned, Purple)

### Community 17 - "LangSmith Trace Screenshot"
Cohesion: 0.33
Nodes (7): LangSmith Trace View Screenshot, ChatOpenAI Model Calls, LangGraph Run Trace (llm-backend-template project), PatchToolCallsMiddleware.before_agent, Sample User Query: quantum computing + generative AI research search, tavily_search Tool Call, TodoListMiddleware.after_model

### Community 18 - "GitHub Autofix Skill Docs"
Cohesion: 0.50
Nodes (5): GitHub CLI Commands Reference (github.md), Fetch Unresolved Review Threads GraphQL Query, AGENTS.md repository instructions file, CodeRabbit Autofix Skill, gh (GitHub CLI) prerequisite

### Community 19 - "Agent Construction Tests"
Cohesion: 0.50
Nodes (3): asyncio, test_get_agent_no_uri(), test_get_agent_success()

### Community 20 - "Main Endpoint Tests"
Cohesion: 0.60
Nodes (4): asyncio, test_chat_endpoint_success(), test_health_check_ok(), test_health_check_redis_error()

### Community 21 - "Code Reviewer Reference Docs"
Cohesion: 1.00
Nodes (4): Code Review Checklist Reference Doc, Coding Standards Reference Doc, Common Antipatterns Reference Doc, Code Reviewer Skill (generic template)

## Ambiguous Edges - Review These
- `src/streaming.py responsibility (LangGraph event conversion)` → `Reference to backend/utils/streaming.py for contract verification`  [AMBIGUOUS]
  .gemini/agents/frontend_architect.md · relation: references
- `Python Hooks (ruff lint/format, mypy)` → `backend/pyproject.toml (mypy config file, not verified in this chunk)`  [AMBIGUOUS]
  .pre-commit-config.yaml · relation: references
- `Fictional Bassoon Chat UI Screenshot` → `Collapsible tavily_search Tool Call UI Element`  [AMBIGUOUS]
  images/app.png · relation: shares_data_with
- `LangGraph Run Trace (llm-backend-template project)` → `PatchToolCallsMiddleware.before_agent`  [AMBIGUOUS]
  images/langsmith.png · relation: conceptually_related_to

## Knowledge Gaps
- **101 isolated node(s):** `fictional-bassoon`, `extends`, `next/core-web-vitals`, `semi`, `trailingComma` (+96 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `src/streaming.py responsibility (LangGraph event conversion)` and `Reference to backend/utils/streaming.py for contract verification`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Python Hooks (ruff lint/format, mypy)` and `backend/pyproject.toml (mypy config file, not verified in this chunk)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Fictional Bassoon Chat UI Screenshot` and `Collapsible tavily_search Tool Call UI Element`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **What is the exact relationship between `LangGraph Run Trace (llm-backend-template project)` and `PatchToolCallsMiddleware.before_agent`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `ChatRequest` connect `LangGraph Agent Construction` to `FastAPI SSE Chat Endpoint`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `run_agent_and_stream()` connect `LangGraph Agent Construction` to `Streaming Event Tests`, `Redis Pub/Sub Streaming`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Frontend Lint/Test Tooling` to `Frontend Package Dependencies`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
