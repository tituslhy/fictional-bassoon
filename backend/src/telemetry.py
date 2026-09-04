"""Optional OpenTelemetry export to Tempo (OTLP).

LangSmith stays the LLM/agent trace UI. This module ships FastAPI
request spans (and an optional worker span) to Tempo so Grafana can
show the HTTP → worker path. No LangSmith→Grafana bridge — that is a
different product, not an OTLP feed.
"""

import logging
import os

logger = logging.getLogger("backend")


def setup_telemetry(service_name: str) -> None:
    """No-op unless ``OTEL_EXPORTER_OTLP_ENDPOINT`` is set."""
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    if not endpoint:
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        logger.warning("OTEL_EXPORTER_OTLP_ENDPOINT is set but OpenTelemetry is not installed")
        return

    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)
    traces_url = endpoint.rstrip("/")
    if not traces_url.endswith("/v1/traces"):
        traces_url = f"{traces_url}/v1/traces"
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=traces_url)))
    trace.set_tracer_provider(provider)
    logger.info("OpenTelemetry traces → %s service=%s", traces_url, service_name)


def instrument_fastapi(app) -> None:
    """Attach FastAPI request spans. No-op when OTLP is unset."""
    if not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip():
        return
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    except ImportError:
        logger.warning("opentelemetry-instrumentation-fastapi is not installed")
        return
    FastAPIInstrumentor.instrument_app(app)


def agent_run_span(job_id: str, thread_id: str):
    """Sync context manager around one Celery agent run. No-op without OTLP."""
    from contextlib import nullcontext

    if not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip():
        return nullcontext()
    try:
        from opentelemetry import trace
    except ImportError:
        return nullcontext()
    return trace.get_tracer("celery_worker").start_as_current_span(
        "run_agent_and_stream",
        attributes={"job.id": job_id, "thread.id": thread_id},
    )
