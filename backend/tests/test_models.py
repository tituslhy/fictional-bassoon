import pytest
from src.models.chat_models import ChatRequest

def test_chat_request_valid():
    request = ChatRequest(message="hello", thread_id="t1")
    assert request.message == "hello"
    assert request.thread_id == "t1"
    assert request.job_id is None

def test_chat_request_with_job_id():
    request = ChatRequest(message="hello")
    request_with_id = request.with_job_id()
    
    assert request_with_id.job_id is not None
    assert len(request_with_id.job_id) == 36 # UUID length
    assert request_with_id.message == "hello"
    
    # Existing job_id should be preserved
    request_fixed = ChatRequest(message="hi", job_id="fixed-id")
    assert request_fixed.with_job_id().job_id == "fixed-id"

def test_chat_request_validation():
    # Message too short
    with pytest.raises(ValueError):
        ChatRequest(message="")
    
    # Message too long
    with pytest.raises(ValueError):
        ChatRequest(message="a" * 10001)
