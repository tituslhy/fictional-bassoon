FROM python:3.13-slim

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl gcc libpq-dev && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install uv globally to /usr/local/bin so it's accessible by any user
ENV UV_INSTALL_DIR="/usr/local/bin"
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Create app user and workdir
RUN useradd --create-home --uid 1001 app
WORKDIR /app
RUN chown app:app /app

# Switch to app user for the rest of the build
USER app

# Copy only what's needed for sync to cache layers
COPY --chown=app:app pyproject.toml uv.lock ./
# Note: uv will create the .venv in the current directory (/app)
RUN uv sync --frozen

# Copy the rest of the application code
COPY --chown=app:app . .

# Ensure logs directory exists and is writable
RUN mkdir -p logs && chown app:app logs

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

# Use uv run to ensure the virtualenv is used correctly
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
