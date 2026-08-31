import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Sidebar from './Sidebar';
import * as ThreadContext from '@/context/ThreadContext';
import * as AuthContext from '@/context/AuthContext';

vi.mock('@/context/ThreadContext');
vi.mock('@/context/AuthContext');

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render sidebar with new thread button', () => {
    const mockCreateThread = vi.fn();
    (ThreadContext.useThreadsContext as any).mockReturnValue({
      threads: [],
      activeThreadId: null,
      setActiveThreadId: vi.fn(),
      createThread: mockCreateThread,
      deleteThread: vi.fn(),
    });
    (AuthContext.useAuth as any).mockReturnValue({
      user: null,
      logout: vi.fn(),
    });

    render(<Sidebar />);

    expect(screen.getByText('New Thread')).toBeInTheDocument();
  });

  it('should render thread list', () => {
    const threads = [
      { id: '1', title: 'Thread 1', messages: [] },
      { id: '2', title: 'Thread 2', messages: [] },
    ];
    const mockSetActiveThreadId = vi.fn();

    (ThreadContext.useThreadsContext as any).mockReturnValue({
      threads,
      activeThreadId: '1',
      setActiveThreadId: mockSetActiveThreadId,
      createThread: vi.fn(),
      deleteThread: vi.fn(),
    });
    (AuthContext.useAuth as any).mockReturnValue({
      user: null,
      logout: vi.fn(),
    });

    render(<Sidebar />);

    expect(screen.getByText('Thread 1')).toBeInTheDocument();
    expect(screen.getByText('Thread 2')).toBeInTheDocument();
  });

  it('should show empty state when no threads', () => {
    (ThreadContext.useThreadsContext as any).mockReturnValue({
      threads: [],
      activeThreadId: null,
      setActiveThreadId: vi.fn(),
      createThread: vi.fn(),
      deleteThread: vi.fn(),
    });
    (AuthContext.useAuth as any).mockReturnValue({
      user: null,
      logout: vi.fn(),
    });

    render(<Sidebar />);

    expect(screen.getByText(/No threads yet/)).toBeInTheDocument();
    expect(screen.getByText(/Create one to get started/)).toBeInTheDocument();
  });

  it('should display user info when logged in', () => {
    (ThreadContext.useThreadsContext as any).mockReturnValue({
      threads: [],
      activeThreadId: null,
      setActiveThreadId: vi.fn(),
      createThread: vi.fn(),
      deleteThread: vi.fn(),
    });
    (AuthContext.useAuth as any).mockReturnValue({
      user: {
        id: 'user_123',
        email: 'test@example.com',
        full_name: 'Test User',
      },
      logout: vi.fn(),
    });

    render(<Sidebar />);

    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('should display email when full_name is not available', () => {
    (ThreadContext.useThreadsContext as any).mockReturnValue({
      threads: [],
      activeThreadId: null,
      setActiveThreadId: vi.fn(),
      createThread: vi.fn(),
      deleteThread: vi.fn(),
    });
    (AuthContext.useAuth as any).mockReturnValue({
      user: {
        id: 'user_123',
        email: 'john@example.com',
      },
      logout: vi.fn(),
    });

    render(<Sidebar />);

    // Should show the part before @ when no full_name
    expect(screen.getByText('john')).toBeInTheDocument();
  });

  it('should call logout when logout button clicked', () => {
    const mockLogout = vi.fn();
    (ThreadContext.useThreadsContext as any).mockReturnValue({
      threads: [],
      activeThreadId: null,
      setActiveThreadId: vi.fn(),
      createThread: vi.fn(),
      deleteThread: vi.fn(),
    });
    (AuthContext.useAuth as any).mockReturnValue({
      user: {
        id: 'user_123',
        email: 'test@example.com',
        full_name: 'Test User',
      },
      logout: mockLogout,
    });

    render(<Sidebar />);

    const logoutBtn = screen.getByTitle('Logout');
    fireEvent.click(logoutBtn);

    expect(mockLogout).toHaveBeenCalled();
  });

  it('should not display user section when not logged in', () => {
    (ThreadContext.useThreadsContext as any).mockReturnValue({
      threads: [],
      activeThreadId: null,
      setActiveThreadId: vi.fn(),
      createThread: vi.fn(),
      deleteThread: vi.fn(),
    });
    (AuthContext.useAuth as any).mockReturnValue({
      user: null,
      logout: vi.fn(),
    });

    render(<Sidebar />);

    expect(screen.queryByTitle('Logout')).not.toBeInTheDocument();
  });

  it('should create new thread when button clicked', () => {
    const mockCreateThread = vi.fn();
    (ThreadContext.useThreadsContext as any).mockReturnValue({
      threads: [],
      activeThreadId: null,
      setActiveThreadId: vi.fn(),
      createThread: mockCreateThread,
      deleteThread: vi.fn(),
    });
    (AuthContext.useAuth as any).mockReturnValue({
      user: null,
      logout: vi.fn(),
    });

    render(<Sidebar />);

    const newThreadBtn = screen.getByText('New Thread');
    fireEvent.click(newThreadBtn);

    expect(mockCreateThread).toHaveBeenCalled();
  });

  it('should call setActiveThreadId when thread is clicked', () => {
    const threads = [
      { id: '1', title: 'Thread 1', messages: [] },
      { id: '2', title: 'Thread 2', messages: [] },
    ];
    const mockSetActiveThreadId = vi.fn();

    (ThreadContext.useThreadsContext as any).mockReturnValue({
      threads,
      activeThreadId: null,
      setActiveThreadId: mockSetActiveThreadId,
      createThread: vi.fn(),
      deleteThread: vi.fn(),
    });
    (AuthContext.useAuth as any).mockReturnValue({
      user: null,
      logout: vi.fn(),
    });

    const { container } = render(<Sidebar />);

    // Click on first thread's title button
    const threadButtons = container.querySelectorAll('button');
    fireEvent.click(threadButtons[1]); // First button is New Thread, second is first thread

    expect(mockSetActiveThreadId).toHaveBeenCalledWith('1');
  });

  it('should call deleteThread when delete button clicked', () => {
    const threads = [{ id: '1', title: 'Thread 1', messages: [] }];
    const mockDeleteThread = vi.fn();

    (ThreadContext.useThreadsContext as any).mockReturnValue({
      threads,
      activeThreadId: null,
      setActiveThreadId: vi.fn(),
      createThread: vi.fn(),
      deleteThread: mockDeleteThread,
    });
    (AuthContext.useAuth as any).mockReturnValue({
      user: null,
      logout: vi.fn(),
    });

    render(<Sidebar />);

    const deleteBtn = screen.getByLabelText('Delete Thread 1');
    fireEvent.click(deleteBtn);

    expect(mockDeleteThread).toHaveBeenCalledWith('1');
  });
});
