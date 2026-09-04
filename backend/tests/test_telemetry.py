from unittest.mock import patch

from src.telemetry import agent_run_span, instrument_fastapi, setup_telemetry


def test_setup_telemetry_noop_without_endpoint():
    with patch.dict("os.environ", {}, clear=True):
        setup_telemetry("backend")


def test_instrument_fastapi_noop_without_endpoint():
    with patch.dict("os.environ", {}, clear=True):
        instrument_fastapi(object())


def test_agent_run_span_noop_without_endpoint():
    with patch.dict("os.environ", {}, clear=True):
        with agent_run_span("job", "thread"):
            pass
