import pytest
import os
from unittest.mock import patch, MagicMock
from src.celery_app import start_metrics_server

def test_start_metrics_server():
    with patch("src.celery_app.start_http_server") as mock_start:
        with patch.dict(os.environ, {"METRICS_PORT": "9000"}):
            start_metrics_server(sender=None)
            mock_start.assert_called_once_with(9000)

def test_start_metrics_server_default():
    with patch("src.celery_app.start_http_server") as mock_start:
        with patch.dict(os.environ, {}, clear=True):
            if "METRICS_PORT" in os.environ:
                del os.environ["METRICS_PORT"]
            start_metrics_server(sender=None)
            mock_start.assert_called_once_with(8001)

def test_start_metrics_server_error():
    with patch("src.celery_app.start_http_server", side_effect=Exception("Failed")) as mock_start:
        # Should not raise exception
        start_metrics_server(sender=None)
        mock_start.assert_called_once()
