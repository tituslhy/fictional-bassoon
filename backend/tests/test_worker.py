import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from src.worker.worker_runner import run_agent_and_stream
from src.worker.tasks import run_agent_task
from src.models.chat_models import ChatRequest

@pytest.mark.asyncio
async def test_run_agent_and_stream():
    request = ChatRequest(message="test", thread_id="t1", job_id="j1")
    
    # Mock stream_agent_events to yield a few test events
    mock_events = [
        {"event": "answer", "data": "hello"},
        {"event": "done", "data": ""}
    ]
    
    async def mock_stream(*args, **kwargs):
        for e in mock_events:
            yield e

    with patch("src.worker.worker_runner.stream_agent_events", side_effect=mock_stream) as mock_stream_func, \
         patch("src.worker.worker_runner.publish_event", new_callable=AsyncMock) as mock_publish, \
         patch("src.worker.worker_runner.get_agent") as mock_get_agent:
        
        mock_get_agent.return_value = MagicMock()
        
        await run_agent_and_stream(request)
        
        assert mock_publish.call_count == 2
        mock_publish.assert_any_call("j1", mock_events[0])
        mock_publish.assert_any_call("j1", mock_events[1])

def test_run_agent_task():
    request_dict = {"message": "test", "thread_id": "t1", "job_id": "j1"}
    
    with patch("src.worker.tasks.run_agent_and_stream") as mock_runner, \
         patch("src.worker.tasks._run_coroutine_sync") as mock_sync_runner:
        
        run_agent_task(request_dict)
        
        # Verify it created a ChatRequest and passed the coro to sync runner
        mock_sync_runner.assert_called_once()
        args, _ = mock_sync_runner.call_args
        # The argument should be a coroutine object from run_agent_and_stream
        assert hasattr(args[0], "send") # Coroutines have .send()
