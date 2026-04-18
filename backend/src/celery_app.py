"""Celery app configuration for the deep agent background worker."""

import logging
import os

from celery import Celery

logger = logging.getLogger("backend")

celery_app = Celery(
    "deep_agent",
    broker=os.getenv("BROKER_URL", "amqp://guest:guest@localhost:5672//"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "rpc://"),
)

celery_app.conf.imports = ("src.worker.tasks",)
logger.info("celery app configured: broker=%s backend=%s", celery_app.conf.broker_url, celery_app.conf.result_backend)
