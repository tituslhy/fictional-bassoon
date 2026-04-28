import pytest
import os
from unittest.mock import AsyncMock, patch, MagicMock
import src.agent

def test_create_agent():
    with patch("src.agent.create_deep_agent") as mock_create, \
         patch("src.agent.init_chat_model") as mock_init_model, \
         patch("src.agent.TavilySearch") as mock_tavily:
        
        mock_create.return_value = MagicMock()
        agent = src.agent.create_agent()
        
        assert agent is not None
        mock_create.assert_called_once()
        mock_init_model.assert_called_once()
        mock_tavily.assert_called_once()

@pytest.mark.asyncio
async def test_get_agent_success():
    # Mock the imports inside get_agent
    with patch.dict(os.environ, {"DB_URI": "postgresql://test"}), \
         patch("psycopg_pool.AsyncConnectionPool") as mock_pool_class, \
         patch("langgraph.checkpoint.postgres.aio.AsyncPostgresSaver") as mock_saver_class, \
         patch("src.agent.create_agent") as mock_create_agent:
        
        mock_pool = AsyncMock()
        mock_pool_class.return_value = mock_pool
        
        mock_saver = AsyncMock()
        mock_saver_class.return_value = mock_saver
        
        mock_agent = MagicMock()
        mock_create_agent.return_value = mock_agent
        
        agent = await src.agent.get_agent()
        
        assert agent == mock_agent
        mock_pool.open.assert_called_once()
        mock_saver.setup.assert_called_once()
        mock_create_agent.assert_called_once_with(checkpointer=mock_saver)

@pytest.mark.asyncio
async def test_get_agent_no_uri():
    with patch.dict(os.environ, {}, clear=True):
        if "DB_URI" in os.environ:
            del os.environ["DB_URI"]
        with pytest.raises(RuntimeError, match="DB_URI environment variable is not set"):
            await src.agent.get_agent()
