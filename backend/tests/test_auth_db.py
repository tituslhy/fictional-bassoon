import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from src.auth import hash_password, verify_password, create_access_token
from src.db import get_db_pool, close_db_pool

def test_password_hashing():
    # Mocking passlib context because bcrypt is problematic in some environments
    with patch("src.auth.pwd_context") as mock_ctx:
        mock_ctx.hash.return_value = "hashed"
        mock_ctx.verify.return_value = True
        
        password = "secret-password"
        hashed = hash_password(password)
        assert hashed == "hashed"
        assert verify_password(password, hashed)
        mock_ctx.verify.return_value = False
        assert not verify_password("wrong", hashed)

def test_create_access_token():
    with patch("src.auth.SECRET_KEY", "a-very-long-secret-key-that-is-at-least-32-bytes"):
        data = {"user_id": "123", "email": "test@example.com"}
        token = create_access_token(data)
        assert isinstance(token, str)
        assert len(token) > 0

@pytest.mark.asyncio
async def test_db_pool_lifecycle():
    with patch("src.db.AsyncConnectionPool") as mock_pool_class:
        mock_pool = MagicMock()
        mock_pool.open = AsyncMock() 
        mock_pool.close = AsyncMock()
        mock_pool_class.return_value = mock_pool
        
        import src.db
        src.db._pool = None
        
        with patch.dict("os.environ", {"DB_URI": "postgresql://test"}):
            pool = await get_db_pool()
            assert pool == mock_pool
            mock_pool.open.assert_called_once()
            
            await close_db_pool()
            mock_pool.close.assert_called_once()
            assert src.db._pool is None

@pytest.mark.asyncio
async def test_auth_signup_login_flow():
    from main import app
    from httpx import AsyncClient, ASGITransport
    
    mock_pool = MagicMock()
    mock_conn = MagicMock()
    mock_cur = AsyncMock()
    
    # Setup async context manager for pool.connection()
    mock_pool.connection.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.connection.return_value.__aexit__ = AsyncMock()
    
    # Setup async context manager for conn.cursor()
    mock_conn.cursor.return_value.__aenter__ = AsyncMock(return_value=mock_cur)
    mock_conn.cursor.return_value.__aexit__ = AsyncMock()
    
    # Mock signup: user does not exist
    mock_cur.fetchone.side_effect = [
        None, # First call: SELECT id FROM api.users WHERE email = ...
        ("new-user-id",) # Second call: INSERT INTO api.users ... RETURNING id
    ]
    
    with patch("main.get_db_pool", return_value=mock_pool), \
         patch("src.auth.pwd_context") as mock_pwd:
        mock_pwd.hash.return_value = "hashed"
        mock_pwd.verify.return_value = True
        
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            signup_payload = {
                "email": "new@example.com",
                "password": "password123",
                "full_name": "New User"
            }
            response = await ac.post("/auth/signup", json=signup_payload)
            # Check for 200 and valid JSON
            assert response.status_code == 200
            data = response.json()
            assert "access_token" in data
            
            # Mock Login
            mock_cur.fetchone.side_effect = [
                ("user-id", "hashed") 
            ]
            
            login_payload = {
                "email": "new@example.com",
                "password": "password123"
            }
            response = await ac.post("/auth/login", json=login_payload)
            assert response.status_code == 200
            assert "access_token" in response.json()

@pytest.mark.asyncio
async def test_auth_login_failure():
    from main import app
    from httpx import AsyncClient, ASGITransport

    mock_pool = MagicMock()
    mock_conn = MagicMock()
    mock_cur = AsyncMock()
    
    mock_pool.connection.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn.cursor.return_value.__aenter__ = AsyncMock(return_value=mock_cur)
    
    mock_cur.fetchone.return_value = None
    
    with patch("main.get_db_pool", return_value=mock_pool):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            login_payload = {"email": "nonexistent@example.com", "password": "any"}
            response = await ac.post("/auth/login", json=login_payload)
            assert response.status_code == 401
