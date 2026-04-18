"""Celery app configuration for the deep agent background worker."""

from celery import Celery

celery_app = Celery(
    "deep_agent",
    broker="amqp://guest:guest@localhost:5672//",  # RabbitMQ
    backend="rpc://",  # optional
)
