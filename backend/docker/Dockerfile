FROM python:3.13-slim AS base

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    curl -LsSf https://astral.sh/uv/install.sh | sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen

COPY src/ ./src/
COPY utils/ ./utils/
COPY logging.ini ./
COPY main.py ./

ENV PYTHONUNBUFFERED=1

RUN useradd --create-home --uid 1001 app && chown -R app:app /app /root/.local
USER app

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
