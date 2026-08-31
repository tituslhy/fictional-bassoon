import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Chat from './Chat';
import * as AuthContext from '@/context/AuthContext';
import * as ThreadContext from '@/context/ThreadContext';
import * as useSSEStreamModule from '@/hooks/useSSEStream';

// Mock external dependencies
vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/context/ThreadContext', () => ({
  useThreadsContext: vi.fn(),
  useThreadStore: vi.fn(),
}));

vi.mock('@/hooks/useSSEStream', () => ({
  useSSEStream: vi.fn(),
}));

vi.mock('./MessageList', () => ({
  default: () => <div data-testid="message-list">Message List</div>,
}));

vi.mock('./MessageInput', () => ({
  default: () => <div data-testid="message-input">Message Input</div>,
}));

vi.mock('@/components/sidebar/Sidebar', () => ({
  default: () => <div data-testid="sidebar">Sidebar</div>,
}));

describe('Chat Component - Rendering and Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock thread store
    const mockStore = {
      threads: [
        {
          id: 'thread_123',
          title: 'New Thread',
          messages: [],
        },
      ],
      updateThreadMessages: vi.fn(),
      updateThreadTitle: vi.fn(),
    };

    // Mock hooks
    (ThreadContext.useThreadsContext as any).mockReturnValue({
      activeThreadId: 'thread_123',
    });

    (ThreadContext.useThreadStore as any).mockReturnValue({
      current: mockStore,
    });

    (AuthContext.useAuth as any).mockReturnValue({
      token: 'test_token_123',
    });

    // Mock useSSEStream
    (useSSEStreamModule.useSSEStream as any).mockReturnValue({
      isLoading: false,
      error: null,
      isStreaming: false,
      start: vi.fn(),
    });
  });

  it('should render chat UI with message list and input', () => {
    render(<Chat />);

    expect(screen.getByTestId('message-list')).toBeInTheDocument();
    expect(screen.getByTestId('message-input')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('should call useSSEStream with correct token', () => {
    render(<Chat />);

    expect(useSSEStreamModule.useSSEStream).toHaveBeenCalled();
    const call = (useSSEStreamModule.useSSEStream as any).mock.calls[0][0];
    expect(call.token).toBe('test_token_123');
  });

  it('should pass onEvent callback to useSSEStream', () => {
    render(<Chat />);

    expect(useSSEStreamModule.useSSEStream).toHaveBeenCalled();
    const call = (useSSEStreamModule.useSSEStream as any).mock.calls[0][0];
    expect(call.onEvent).toBeDefined();
    expect(typeof call.onEvent).toBe('function');
  });

  it('should pass onError callback to useSSEStream', () => {
    render(<Chat />);

    const call = (useSSEStreamModule.useSSEStream as any).mock.calls[0][0];
    expect(call.onError).toBeDefined();
    expect(typeof call.onError).toBe('function');
  });

  it('should handle stream start with correct parameters', () => {
    const mockStream = {
      isLoading: false,
      error: null,
      isStreaming: false,
      start: vi.fn(),
    };

    (useSSEStreamModule.useSSEStream as any).mockReturnValue(mockStream);

    render(<Chat />);

    // The component should be able to start the stream
    // (we can't directly test this without interaction)
    expect(mockStream.start).not.toHaveBeenCalled(); // Not called on render
  });
});

describe('Chat Component - AG-UI Event Handling Logic', () => {
  /**
   * Note: Testing the full Chat.tsx event handling logic is complex because:
   * 1. The component uses refs to track internal streaming state
   * 2. Event processing happens in nested closures with captured state
   * 3. The mirror() function synchronizes with a store mock
   *
   * The actual event processing is already tested in integration via:
   * - useSSEStream.test.ts (AG-UI event parsing)
   * - agui/events.test.ts and agui/streamState.test.ts (event structure)
   *
   * Here we verify the component's event callback integrates properly:
   */

  let mockEventCallback: ((event: any) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockStore = {
      threads: [
        {
          id: 'thread_123',
          title: 'New Thread',
          messages: [],
        },
      ],
      updateThreadMessages: vi.fn(),
      updateThreadTitle: vi.fn(),
    };

    (ThreadContext.useThreadsContext as any).mockReturnValue({
      activeThreadId: 'thread_123',
    });

    (ThreadContext.useThreadStore as any).mockReturnValue({
      current: mockStore,
    });

    (AuthContext.useAuth as any).mockReturnValue({
      token: 'test_token_123',
    });

    // Capture the event callback
    (useSSEStreamModule.useSSEStream as any).mockImplementation(({ onEvent }: any) => {
      mockEventCallback = onEvent;
      return {
        isLoading: false,
        error: null,
        isStreaming: false,
        start: vi.fn(),
      };
    });
  });

  it('should receive AG-UI events through the callback', () => {
    render(<Chat />);

    expect(mockEventCallback).toBeDefined();
    expect(typeof mockEventCallback).toBe('function');
  });

  it('should not crash when receiving TEXT_MESSAGE_CONTENT without streamingTargetThreadId', () => {
    render(<Chat />);

    // Call without prior message send (streamingTargetThreadIdRef will be null)
    expect(() => {
      mockEventCallback?.({
        event: 'TEXT_MESSAGE_CONTENT',
        data: JSON.stringify({ delta: 'Some text' }),
      });
    }).not.toThrow();
  });

  it('should not crash when receiving TOOL_CALL_START without streamingTargetThreadId', () => {
    render(<Chat />);

    expect(() => {
      mockEventCallback?.({
        event: 'TOOL_CALL_START',
        data: JSON.stringify({ toolCallId: 'call_1', toolCallName: 'tool' }),
      });
    }).not.toThrow();
  });

  it('should not crash when receiving RUN_FINISHED', () => {
    render(<Chat />);

    expect(() => {
      mockEventCallback?.({
        event: 'RUN_FINISHED',
        data: JSON.stringify({ threadId: 'thread_123' }),
      });
    }).not.toThrow();
  });

  it('should not crash when receiving RUN_ERROR', () => {
    render(<Chat />);

    expect(() => {
      mockEventCallback?.({
        event: 'RUN_ERROR',
        data: JSON.stringify({ message: 'Test error' }),
      });
    }).not.toThrow();
  });

  it('should handle malformed JSON in event data', () => {
    render(<Chat />);

    expect(() => {
      mockEventCallback?.({
        event: 'TEXT_MESSAGE_CONTENT',
        data: 'not valid json {[',
      });
    }).not.toThrow();
  });

  it('should ignore lifecycle marker events', () => {
    render(<Chat />);

    const lifecycleEvents = [
      'RUN_STARTED',
      'STEP_STARTED',
      'STEP_FINISHED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_END',
      'REASONING_MESSAGE_START',
      'REASONING_MESSAGE_END',
      'TOOL_CALL_END',
    ];

    expect(() => {
      lifecycleEvents.forEach(eventType => {
        mockEventCallback?.({
          event: eventType,
          data: JSON.stringify({}),
        });
      });
    }).not.toThrow();
  });

  it('should safely handle events with missing required fields', () => {
    render(<Chat />);

    expect(() => {
      mockEventCallback?.({
        event: 'TEXT_MESSAGE_CONTENT',
        data: JSON.stringify({}), // missing delta
      });

      mockEventCallback?.({
        event: 'TOOL_CALL_START',
        data: JSON.stringify({}), // missing toolCallId/toolCallName
      });

      mockEventCallback?.({
        event: 'TOOL_CALL_ARGS',
        data: JSON.stringify({ delta: 'args' }), // missing toolCallId
      });

      mockEventCallback?.({
        event: 'RUN_ERROR',
        data: JSON.stringify({}), // missing message
      });
    }).not.toThrow();
  });
});
