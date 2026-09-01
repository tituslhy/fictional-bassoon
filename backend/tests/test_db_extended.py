import os
from unittest.mock import patch

import pytest

from src.db import get_db_pool


@pytest.mark.asyncio
async def test_get_db_pool_no_uri():
    with patch.dict(os.environ, {}, clear=True):
        if "DB_URI" in os.environ:
            del os.environ["DB_URI"]

        # Reset pool
        import src.db

        src.db._pool = None

        with pytest.raises(RuntimeError, match="DB_URI environment variable is not set"):
            await get_db_pool()
