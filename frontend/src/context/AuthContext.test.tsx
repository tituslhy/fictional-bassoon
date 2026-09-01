import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useAuth, AuthProvider } from './AuthContext';
import * as nextNavigation from 'next/navigation';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

const mockRouter = {
  push: vi.fn(),
};

// Helper to create a valid JWT token
function createMockToken(overrides = {}) {
  const header = btoa(JSON.stringify({ alg: 'HS256' }));
  const payload = btoa(
    JSON.stringify({
      user_id: 'user_123',
      email: 'test@example.com',
      ...overrides,
    })
  );
  const signature = 'signature';
  return `${header}.${payload}.${signature}`;
}

// Test component that uses auth
function TestComponent() {
  const { user, token, isLoading, login, signup, logout, error } = useAuth();

  return (
    <div>
      <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
      <div data-testid="token">{token || 'no-token'}</div>
      <div data-testid="user">{user?.email || 'no-user'}</div>
      <div data-testid="error">{error || 'no-error'}</div>
      <button onClick={() => login('test@example.com', 'password')} data-testid="login-btn">
        Login
      </button>
      <button
        onClick={() => signup('test@example.com', 'password', 'Test User')}
        data-testid="signup-btn"
      >
        Signup
      </button>
      <button onClick={logout} data-testid="logout-btn">
        Logout
      </button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (nextNavigation.useRouter as any).mockReturnValue(mockRouter);
    (global.fetch as any).mockClear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('AuthProvider initialization', () => {
    it('should load token from localStorage on mount', async () => {
      const token = createMockToken();
      localStorage.setItem('auth_token', token);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
        expect(screen.getByTestId('token')).toHaveTextContent(token);
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });
    });

    it('should become ready when initialization completes', async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // Should eventually become ready
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      // Should have no token
      expect(screen.getByTestId('token')).toHaveTextContent('no-token');
    });

    it('should handle invalid token gracefully', async () => {
      localStorage.setItem('auth_token', 'invalid.token');

      // Suppress console errors for invalid token parsing
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });

      consoleError.mockRestore();
    });
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const token = createMockToken();
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: token }),
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const loginBtn = screen.getByTestId('login-btn');

      await act(async () => {
        fireEvent.click(loginBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('token')).toHaveTextContent(token);
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });

      expect(localStorage.getItem('auth_token')).toBe(token);
      expect(mockRouter.push).toHaveBeenCalledWith('/');
    });

    it('should set loading state during login', async () => {
      let resolveLogin: any;
      (global.fetch as any).mockReturnValueOnce(
        new Promise(resolve => {
          resolveLogin = () =>
            resolve({
              ok: true,
              json: async () => ({ access_token: createMockToken() }),
            });
        })
      );

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const loginBtn = screen.getByTestId('login-btn');

      act(() => {
        fireEvent.click(loginBtn);
      });

      // Login should complete after resolving
      act(() => {
        resolveLogin();
      });

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready');
      });
    });

    it('should call fetch with correct login endpoint', async () => {
      const token = createMockToken();
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: token }),
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const loginBtn = screen.getByTestId('login-btn');

      await act(async () => {
        fireEvent.click(loginBtn);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/auth/login'),
          expect.any(Object)
        );
      });
    });
  });

  describe('signup', () => {
    it('should successfully signup with email, password, and name', async () => {
      const token = createMockToken();
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: token }),
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const signupBtn = screen.getByTestId('signup-btn');

      await act(async () => {
        fireEvent.click(signupBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('token')).toHaveTextContent(token);
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });

      expect(localStorage.getItem('auth_token')).toBe(token);
      expect(mockRouter.push).toHaveBeenCalledWith('/');

      // Verify fetch was called with correct endpoint
      const calls = (global.fetch as any).mock.calls;
      expect(calls[0][0]).toContain('/auth/signup');
    });

    it('should include full_name in signup request', async () => {
      const token = createMockToken();
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: token }),
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const signupBtn = screen.getByTestId('signup-btn');

      await act(async () => {
        fireEvent.click(signupBtn);
      });

      await waitFor(() => {
        expect(screen.getByTestId('token')).toHaveTextContent(token);
      });

      // Verify fetch body contains full_name
      const calls = (global.fetch as any).mock.calls;
      const bodyStr = calls[0][1].body;
      expect(bodyStr).toContain('full_name');
    });
  });

  describe('logout', () => {
    it('should clear token and user on logout', async () => {
      const token = createMockToken();
      localStorage.setItem('auth_token', token);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('token')).toHaveTextContent(token);
      });

      const logoutBtn = screen.getByTestId('logout-btn');
      fireEvent.click(logoutBtn);

      await waitFor(() => {
        expect(screen.getByTestId('token')).toHaveTextContent('no-token');
        expect(screen.getByTestId('user')).toHaveTextContent('no-user');
      });

      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(mockRouter.push).toHaveBeenCalledWith('/login');
    });

    it('should remove token from localStorage on logout', async () => {
      const token = createMockToken();
      localStorage.setItem('auth_token', token);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(localStorage.getItem('auth_token')).toBe(token);
      });

      const logoutBtn = screen.getByTestId('logout-btn');
      fireEvent.click(logoutBtn);

      expect(localStorage.getItem('auth_token')).toBeNull();
    });
  });

  describe('useAuth hook', () => {
    it('should throw error when used outside AuthProvider', () => {
      const TestComponentWithoutProvider = () => {
        useAuth();
        return null;
      };

      // Suppress error output
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponentWithoutProvider />);
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleError.mockRestore();
    });
  });

  describe('token storage', () => {
    it('should persist token in localStorage after login', async () => {
      const token = createMockToken();
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: token }),
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      const loginBtn = screen.getByTestId('login-btn');

      await act(async () => {
        fireEvent.click(loginBtn);
      });

      await waitFor(() => {
        expect(localStorage.getItem('auth_token')).toBe(token);
      });
    });

    it('should decode JWT payload to extract user info', async () => {
      const token = createMockToken({ user_id: 'custom_id', email: 'custom@email.com' });
      localStorage.setItem('auth_token', token);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('custom@email.com');
      });
    });
  });
});
