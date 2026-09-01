import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
  default: ({ onSend }: any) => (
    <div data-testid="message-input">
      <button onClick={() => onSend('test message')} data-testid="send-btn">
        Send
      </button>
    </div>
  ),
}));

vi.mock('@/components/sidebar/Sidebar', () => ({
  default: () => <div data-testid="sidebar">Sidebar</div>,
}));

describe('Chat Component - Rendering and Integration', () => {
  let mockStore: any;
  let mockStreamStart: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock thread store
    mockStore = {
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

    mockStreamStart = vi.fn();

    // Mock hooks
    (ThreadContext.useThreadsContext as any).mockReturnValue({
      activeThreadId: 'thread_123',
      createThread: vi.fn().mockResolvedValue('thread_123'),
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
      start: mockStreamStart,
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

  it('should pass onComplete callback to useSSEStream', () => {
    render(<Chat />);

    const call = (useSSEStreamModule.useSSEStream as any).mock.calls[0][0];
    expect(call.onComplete).toBeDefined();
    expect(typeof call.onComplete).toBe('function');
  });
});

describe('Chat Component - Message Sending', () => {
  let mockStore: any;
  let mockStreamStart: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStore = {
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

    mockStreamStart = vi.fn();

    (ThreadContext.useThreadsContext as any).mockReturnValue({
      activeThreadId: 'thread_123',
      createThread: vi.fn().mockResolvedValue('thread_123'),
    });

    (ThreadContext.useThreadStore as any).mockReturnValue({
      current: mockStore,
    });

    (AuthContext.useAuth as any).mockReturnValue({
      token: 'test_token_123',
    });

    (useSSEStreamModule.useSSEStream as any).mockReturnValue({
      isLoading: false,
      error: null,
      isStreaming: false,
      start: mockStreamStart,
    });
  });

  it('should send message when send button is clicked', async () => {
    render(<Chat />);

    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    // updateThreadMessages should be called with user and assistant messages
    await waitFor(() => {
      expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    });

    const calls = mockStore.updateThreadMessages.mock.calls;
    const lastCall = calls[calls.length - 1];
    const messages = lastCall[1];

    // Should have both user and assistant message
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('test message');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].status).toBe('streaming');
  });

  it('should call stream.start with correct parameters', async () => {
    render(<Chat />);

    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockStreamStart).toHaveBeenCalledWith({
        message: 'test message',
        thread_id: 'thread_123',
      });
    });
  });

  it('should create a thread when sending with no active thread', async () => {
    const mockCreate = vi.fn().mockResolvedValue('created_thread');
    (ThreadContext.useThreadsContext as any).mockReturnValue({
      activeThreadId: null,
      createThread: mockCreate,
    });

    render(<Chat />);

    mockStore.updateThreadMessages.mockClear();
    mockStreamStart.mockClear();

    const sendBtn = screen.getByTestId('send-btn');
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    expect(mockCreate).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockStreamStart).toHaveBeenCalledWith({
        message: 'test message',
        thread_id: 'created_thread',
      });
    });
  });
});

describe('Chat Component - AG-UI Event Handling Logic', () => {
  let mockEventCallback: ((event: any) => void) | null = null;
  let mockStore: any;
  let mockStreamStart: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStore = {
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

    mockStreamStart = vi.fn();

    (ThreadContext.useThreadsContext as any).mockReturnValue({
      activeThreadId: 'thread_123',
      createThread: vi.fn().mockResolvedValue('thread_123'),
    });

    (ThreadContext.useThreadStore as any).mockReturnValue({
      current: mockStore,
    });

    (AuthContext.useAuth as any).mockReturnValue({
      token: 'test_token_123',
    });

    // Capture the event callback and error callback
    (useSSEStreamModule.useSSEStream as any).mockImplementation(({ onEvent, onError }: any) => {
      mockEventCallback = onEvent;
      return {
        isLoading: false,
        error: null,
        isStreaming: false,
        start: mockStreamStart,
        onError,
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

  it('should handle TEXT_MESSAGE_CONTENT event and update assistant message', async () => {
    render(<Chat />);

    // First send a message to establish streaming state
    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    });

    mockStore.updateThreadMessages.mockClear();

    // Now send a TEXT_MESSAGE_CONTENT event
    act(() => {
      mockEventCallback?.({
        event: 'TEXT_MESSAGE_CONTENT',
        data: JSON.stringify({ delta: 'Hello ' }),
      });
    });

    // Should update the assistant message with content
    expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    const calls = mockStore.updateThreadMessages.mock.calls;
    const lastCall = calls[calls.length - 1];
    const messages = lastCall[1];
    const assistantMsg = messages.find((m: any) => m.role === 'assistant');
    expect(assistantMsg.content).toBe('Hello ');
  });

  it('should handle REASONING_MESSAGE_CONTENT event', async () => {
    render(<Chat />);

    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    });

    mockStore.updateThreadMessages.mockClear();

    act(() => {
      mockEventCallback?.({
        event: 'REASONING_MESSAGE_CONTENT',
        data: JSON.stringify({ delta: 'Thinking... ' }),
      });
    });

    expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    const calls = mockStore.updateThreadMessages.mock.calls;
    const lastCall = calls[calls.length - 1];
    const messages = lastCall[1];
    const assistantMsg = messages.find((m: any) => m.role === 'assistant');
    expect(assistantMsg.reasoning).toBe('Thinking... ');
  });

  it('should handle TOOL_CALL_START event', async () => {
    render(<Chat />);

    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    });

    mockStore.updateThreadMessages.mockClear();

    act(() => {
      mockEventCallback?.({
        event: 'TOOL_CALL_START',
        data: JSON.stringify({ toolCallId: 'call_1', toolCallName: 'search' }),
      });
    });

    expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    const calls = mockStore.updateThreadMessages.mock.calls;
    const lastCall = calls[calls.length - 1];
    const messages = lastCall[1];
    const assistantMsg = messages.find((m: any) => m.role === 'assistant');
    expect(assistantMsg.toolCalls.length).toBe(1);
    expect(assistantMsg.toolCalls[0].id).toBe('call_1');
    expect(assistantMsg.toolCalls[0].name).toBe('search');
  });

  it('should handle TOOL_CALL_ARGS event', async () => {
    render(<Chat />);

    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    });

    mockStore.updateThreadMessages.mockClear();

    // First create a tool call
    act(() => {
      mockEventCallback?.({
        event: 'TOOL_CALL_START',
        data: JSON.stringify({ toolCallId: 'call_1', toolCallName: 'search' }),
      });
    });

    mockStore.updateThreadMessages.mockClear();

    // Then send args
    act(() => {
      mockEventCallback?.({
        event: 'TOOL_CALL_ARGS',
        data: JSON.stringify({ toolCallId: 'call_1', delta: '{"query": "' }),
      });
    });

    expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    const calls = mockStore.updateThreadMessages.mock.calls;
    const lastCall = calls[calls.length - 1];
    const messages = lastCall[1];
    const assistantMsg = messages.find((m: any) => m.role === 'assistant');
    expect(assistantMsg.toolCalls[0].args).toContain('{"query": "');
  });

  it('should handle TOOL_CALL_RESULT event', async () => {
    render(<Chat />);

    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    });

    mockStore.updateThreadMessages.mockClear();

    // First create a tool call
    act(() => {
      mockEventCallback?.({
        event: 'TOOL_CALL_START',
        data: JSON.stringify({ toolCallId: 'call_1', toolCallName: 'search' }),
      });
    });

    mockStore.updateThreadMessages.mockClear();

    // Then send result
    act(() => {
      mockEventCallback?.({
        event: 'TOOL_CALL_RESULT',
        data: JSON.stringify({ toolCallId: 'call_1', content: '[{"title": "Result"}]' }),
      });
    });

    expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    const calls = mockStore.updateThreadMessages.mock.calls;
    const lastCall = calls[calls.length - 1];
    const messages = lastCall[1];
    const assistantMsg = messages.find((m: any) => m.role === 'assistant');
    expect(assistantMsg.toolCalls[0].result).toBe('[{"title": "Result"}]');
  });

  it('should attach a validated A2UI tree from CUSTOM name=a2ui', async () => {
    render(<Chat />);

    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    });

    mockStore.updateThreadMessages.mockClear();

    const tree = {
      id: 'root',
      component: 'column',
      gap: 'loose',
      children: [{ id: 'answer', component: 'markdown', text: 'From the wire', streaming: false }],
    };

    act(() => {
      mockEventCallback?.({
        event: 'CUSTOM',
        data: JSON.stringify({ type: 'CUSTOM', name: 'a2ui', value: tree }),
      });
    });

    expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    const calls = mockStore.updateThreadMessages.mock.calls;
    const lastCall = calls[calls.length - 1];
    const messages = lastCall[1];
    const assistantMsg = messages.find((m: any) => m.role === 'assistant');
    expect(assistantMsg.a2ui.component).toBe('column');
    expect(assistantMsg.a2ui.children[0].text).toBe('From the wire');
  });

  it('should ignore CUSTOM events that are not name=a2ui', async () => {
    render(<Chat />);

    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    });

    mockStore.updateThreadMessages.mockClear();

    act(() => {
      mockEventCallback?.({
        event: 'CUSTOM',
        data: JSON.stringify({ type: 'CUSTOM', name: 'other', value: { nope: true } }),
      });
    });

    expect(mockStore.updateThreadMessages).not.toHaveBeenCalled();
  });

  it('should keep the AG-UI fallback when CUSTOM a2ui fails validation', async () => {
    render(<Chat />);

    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    });

    mockStore.updateThreadMessages.mockClear();

    act(() => {
      mockEventCallback?.({
        event: 'CUSTOM',
        data: JSON.stringify({
          type: 'CUSTOM',
          name: 'a2ui',
          value: { id: 'x', component: 'button', label: 'nope' },
        }),
      });
    });

    expect(mockStore.updateThreadMessages).not.toHaveBeenCalled();
  });

  it('should not crash when receiving TOOL_CALL_ARGS without toolCallId', () => {
    render(<Chat />);

    expect(() => {
      mockEventCallback?.({
        event: 'TOOL_CALL_ARGS',
        data: JSON.stringify({ delta: 'args' }), // missing toolCallId
      });
    }).not.toThrow();
  });

  it('should not crash when receiving TOOL_CALL_RESULT without toolCallId', () => {
    render(<Chat />);

    expect(() => {
      mockEventCallback?.({
        event: 'TOOL_CALL_RESULT',
        data: JSON.stringify({ content: 'result' }), // missing toolCallId
      });
    }).not.toThrow();
  });

  it('should handle RUN_FINISHED event and set status to done', async () => {
    render(<Chat />);

    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    });

    mockStore.updateThreadMessages.mockClear();

    act(() => {
      mockEventCallback?.({
        event: 'RUN_FINISHED',
        data: JSON.stringify({}),
      });
    });

    expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    const calls = mockStore.updateThreadMessages.mock.calls;
    const lastCall = calls[calls.length - 1];
    const messages = lastCall[1];
    const assistantMsg = messages.find((m: any) => m.role === 'assistant');
    expect(assistantMsg.status).toBe('done');
  });

  it('should handle RUN_FINISHED without prior assistant message', () => {
    render(<Chat />);

    expect(() => {
      mockEventCallback?.({
        event: 'RUN_FINISHED',
        data: JSON.stringify({}),
      });
    }).not.toThrow();
  });

  it('should handle RUN_ERROR event and create error message with status error', async () => {
    render(<Chat />);

    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    });

    mockStore.updateThreadMessages.mockClear();

    act(() => {
      mockEventCallback?.({
        event: 'RUN_ERROR',
        data: JSON.stringify({ message: 'API Error' }),
      });
    });

    expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    const calls = mockStore.updateThreadMessages.mock.calls;
    const lastCall = calls[calls.length - 1];
    const messages = lastCall[1];
    const assistantMsg = messages.find((m: any) => m.role === 'assistant');
    expect(assistantMsg.status).toBe('error');
    expect(assistantMsg.error).toBe('API Error');
  });

  it('should handle RUN_ERROR event without prior assistant message', () => {
    render(<Chat />);

    expect(() => {
      mockEventCallback?.({
        event: 'RUN_ERROR',
        data: JSON.stringify({ message: 'Test error' }),
      });
    }).not.toThrow();
  });

  it('should update thread title from first user message on RUN_FINISHED', async () => {
    mockStore.threads[0].messages = [
      {
        id: 'user_1',
        role: 'user',
        content: 'This is a very long message that should be truncated to 40 characters here',
        status: 'done',
        toolCalls: [],
      },
    ];

    render(<Chat />);

    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    });

    mockStore.updateThreadTitle.mockClear();
    mockStore.updateThreadMessages.mockClear();

    act(() => {
      mockEventCallback?.({
        event: 'RUN_FINISHED',
        data: JSON.stringify({}),
      });
    });

    expect(mockStore.updateThreadTitle).toHaveBeenCalledWith(
      'thread_123',
      'This is a very long message that should ...'
    );
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
        event: 'RUN_ERROR',
        data: JSON.stringify({}), // missing message
      });
    }).not.toThrow();
  });
});

describe('Chat Component - Error Handling', () => {
  let mockStore: any;
  let mockStreamStart: any;
  let mockErrorCallback: ((error: string) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStore = {
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

    mockStreamStart = vi.fn();

    (ThreadContext.useThreadsContext as any).mockReturnValue({
      activeThreadId: 'thread_123',
      createThread: vi.fn().mockResolvedValue('thread_123'),
    });

    (ThreadContext.useThreadStore as any).mockReturnValue({
      current: mockStore,
    });

    (AuthContext.useAuth as any).mockReturnValue({
      token: 'test_token_123',
    });

    // Capture both onEvent and onError callbacks
    (useSSEStreamModule.useSSEStream as any).mockImplementation(({ onEvent, onError }: any) => {
      mockErrorCallback = onError;
      return {
        isLoading: false,
        error: null,
        isStreaming: false,
        start: mockStreamStart,
      };
    });
  });

  it('should handle stream error with existing assistant message', async () => {
    render(<Chat />);

    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    });

    mockStore.updateThreadMessages.mockClear();

    act(() => {
      mockErrorCallback?.('Connection failed');
    });

    expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    const calls = mockStore.updateThreadMessages.mock.calls;
    const lastCall = calls[calls.length - 1];
    const messages = lastCall[1];
    const assistantMsg = messages.find((m: any) => m.role === 'assistant');
    expect(assistantMsg.status).toBe('error');
    expect(assistantMsg.error).toBe('Connection failed');
  });

  it('should handle stream error without prior assistant message', () => {
    render(<Chat />);

    expect(() => {
      mockErrorCallback?.('Network error');
    }).not.toThrow();
  });

  it('should unlock send via onComplete when the stream ends without a terminal event', async () => {
    let capturedOnComplete: (() => void) | undefined;
    (useSSEStreamModule.useSSEStream as any).mockImplementation(({ onEvent, onComplete }: any) => {
      capturedOnComplete = onComplete;
      return {
        isLoading: false,
        error: null,
        isStreaming: false,
        start: mockStreamStart,
      };
    });

    render(<Chat />);

    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    });

    mockStore.updateThreadMessages.mockClear();

    act(() => {
      capturedOnComplete?.();
    });

    expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    const calls = mockStore.updateThreadMessages.mock.calls;
    const lastCall = calls[calls.length - 1];
    const messages = lastCall[1];
    const assistantMsg = messages.find((m: any) => m.role === 'assistant');
    expect(assistantMsg.status).toBe('done');
  });

  it('should handle stream error and update store when thread exists', async () => {
    render(<Chat />);

    const sendBtn = screen.getByTestId('send-btn');
    act(() => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockStore.updateThreadMessages).toHaveBeenCalled();
    });

    mockStore.updateThreadMessages.mockClear();

    act(() => {
      mockErrorCallback?.('Stream interrupted');
    });

    expect(mockStore.updateThreadMessages).toHaveBeenCalled();
  });
});
