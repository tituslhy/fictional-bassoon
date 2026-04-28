import pytest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from src.worker.tasks import run_agent_task, _run_coroutine_sync

def test_run_agent_task_error_handling():
    """Test how run_agent_task handles internal execution errors."""
    request_dict = {"message": "test", "thread_id": "t1", "job_id": "j1"}

    # Mock run_agent_and_stream to raise an error when called
    with patch("src.worker.tasks.run_agent_and_stream", side_effect=Exception("Task failed")), \
         patch("src.worker.tasks.logger") as mock_logger:

        # We EXPECT it to catch the exception and log it
        run_agent_task.run(request_dict)
        
        mock_logger.error.assert_called()
        args = mock_logger.error.call_args[0]
        assert "Error running agent task" in args[0]

def test_run_agent_task_invalid_payload():
    """Test how run_agent_task handles invalid input (Pydantic validation failure)."""
    request_dict = {"invalid": "payload"} 
    
    with patch("src.worker.tasks.logger") as mock_logger:
        run_agent_task.run(request_dict)
        
        mock_logger.error.assert_called()
        assert "Error running agent task" in mock_logger.error.call_args[0][0]

def test_run_coroutine_sync_with_existing_loop():
    """Test _run_coroutine_sync when an event loop is already running."""
    mock_loop = MagicMock()
    mock_new_loop = MagicMock()
    
    # Mock a running loop
    with patch("asyncio.get_running_loop", return_value=mock_loop), \
         patch("asyncio.new_event_loop", return_value=mock_new_loop) as mock_new_loop_func, \
         patch("asyncio.set_event_loop") as mock_set_loop:
        
        coro = AsyncMock()()
        _run_coroutine_sync(coro)
        
        mock_new_loop_func.assert_called_once()
        mock_set_loop.assert_called_with(mock_new_loop)
        mock_new_loop.run_until_complete.assert_called_once_with(coro)
        mock_new_loop.close.assert_called_once()
