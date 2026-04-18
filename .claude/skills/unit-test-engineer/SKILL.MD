---
name: unit-test-engineer
description: Use when writing, generating, or modifying unit tests for this project.
---

# Unit Test Engineer

## Framework
- Python: pytest
- Mocking: unittest.mock, pytest-mock
- Pattern: AAA (Arrange, Act, Assert) always

## What to test
- Business logic only
- Mock all external dependencies: LLMs, APIs, Redis, RabbitMQ
- Never test library internals

## What NOT to test
- Framework behaviour (FastAPI routing, Celery internals)
- Third party integrations directly

## Running tests
pytest tests/ -v --cov=backend --cov-report=term-missing

## Mocking LangGraph/LangChain
- Mock at the boundary — mock astream(), not internal chain methods
- Return deterministic fake event sequences for streaming tests