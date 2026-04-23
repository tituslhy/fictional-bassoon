"""Celery app configuration for the deep agent background worker."""

import logging
import os
import threading
from celery import Celery
from celery.signals import worker_ready
from prometheus_client import start_http_server

logger = logging.getLogger("backend")

celery_app = Celery(
    "deep_agent",
    broker=os.getenv("BROKER_URL", "amqp://guest:guest@localhost:5672//"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "rpc://"),
)

celery_app.conf.imports = ("src.worker.tasks",)

@worker_ready.connect
def start_metrics_server(sender, **kwargs):
    """Start a small HTTP server to export Prometheus metrics from the worker."""
    # Use 8001 by default for worker to avoid conflict with backend on 8000
    try:
        metrics_port = int(os.getenv("METRICS_PORT", "8001"))
    except (ValueError, TypeError):
        logger.error("Invalid METRICS_PORT value, falling back to default 8001")
        metrics_port = 8001

    logger.info("Starting Prometheus metrics server on port %d", metrics_port)
    # Start the server in a separate thread so it doesn't block the worker
    try:
        start_http_server(metrics_port)
    except Exception as e:
        logger.error("Failed to start metrics server: %s", e)

logger.info("celery app configured: broker=%s backend=%s", celery_app.conf.broker_url, celery_app.conf.result_backend)