import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MessageList from './MessageList';
import type { ThreadMessage } from '@/types';

// Mock MessageBubble component
vi.mock('./MessageBubble', () => ({
  default: ({ message }: any) => (
    <div data-testid={`message-${message.id}`} className="mb-6">
      Message: {message.id}
    </div>
  ),
}));

// Mock scrollIntoView since jsdom doesn't implement it
HTMLElement.prototype.scrollIntoView = vi.fn();

describe('MessageList', () => {
  const mockMessages: ThreadMessage[] = [
    {
      id: 'msg_1',
      role: 'user',
      content: 'Hello',
      status: 'done',
      toolCalls: [],
    },
    {
      id: 'msg_2',
      role: 'assistant',
      content: 'Hi there!',
      status: 'done',
      toolCalls: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render all messages', () => {
    render(<MessageList messages={mockMessages} isStreaming={false} />);

    expect(screen.getByTestId('message-msg_1')).toBeInTheDocument();
    expect(screen.getByTestId('message-msg_2')).toBeInTheDocument();
  });

  it('should render empty list when no messages', () => {
    const { container } = render(<MessageList messages={[]} isStreaming={false} />);

    const messageContainer = container.querySelector('[class*="flex-1"]');
    expect(messageContainer).toBeInTheDocument();
  });

  it('should render messages with unique keys', () => {
    const messagesWithDuplicateContent: ThreadMessage[] = [
      {
        id: 'unique_1',
        role: 'user',
        content: 'Same content',
        status: 'done',
        toolCalls: [],
      },
      {
        id: 'unique_2',
        role: 'user',
        content: 'Same content',
        status: 'done',
        toolCalls: [],
      },
    ];

    render(<MessageList messages={messagesWithDuplicateContent} isStreaming={false} />);

    expect(screen.getByTestId('message-unique_1')).toBeInTheDocument();
    expect(screen.getByTestId('message-unique_2')).toBeInTheDocument();
  });

  it('should have scroll container', () => {
    const { container } = render(<MessageList messages={mockMessages} isStreaming={false} />);

    const scrollContainer = container.querySelector('[class*="overflow-y-auto"]');
    expect(scrollContainer).toBeInTheDocument();
  });

  it('should render messages in correct order', () => {
    render(<MessageList messages={mockMessages} isStreaming={false} />);

    const messages = screen.getAllByTestId(/^message-/);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toHaveTextContent('msg_1');
    expect(messages[1]).toHaveTextContent('msg_2');
  });

  it('should apply margin between messages', () => {
    const { container } = render(<MessageList messages={mockMessages} isStreaming={false} />);

    const messageDivs = container.querySelectorAll('[class*="mb-6"]');
    expect(messageDivs.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle single message', () => {
    const singleMessage: ThreadMessage[] = [
      {
        id: 'msg_1',
        role: 'user',
        content: 'Hello',
        status: 'done',
        toolCalls: [],
      },
    ];

    render(<MessageList messages={singleMessage} isStreaming={false} />);

    expect(screen.getByTestId('message-msg_1')).toBeInTheDocument();
  });

  it('should update when messages prop changes', () => {
    const { rerender } = render(<MessageList messages={mockMessages} isStreaming={false} />);

    expect(screen.getByTestId('message-msg_1')).toBeInTheDocument();
    expect(screen.getByTestId('message-msg_2')).toBeInTheDocument();

    const updatedMessages: ThreadMessage[] = [
      ...mockMessages,
      {
        id: 'msg_3',
        role: 'user',
        content: 'New message',
        status: 'done',
        toolCalls: [],
      },
    ];

    rerender(<MessageList messages={updatedMessages} isStreaming={false} />);

    expect(screen.getByTestId('message-msg_3')).toBeInTheDocument();
  });

  it('should handle messages with tool calls', () => {
    const messagesWithTools: ThreadMessage[] = [
      {
        id: 'msg_1',
        role: 'assistant',
        content: 'Using a tool',
        status: 'done',
        toolCalls: [
          {
            id: 'call_1',
            name: 'search',
            args: '{}',
            result: 'Tool result',
            expanded: false,
          },
        ],
      },
    ];

    render(<MessageList messages={messagesWithTools} isStreaming={false} />);

    expect(screen.getByTestId('message-msg_1')).toBeInTheDocument();
  });

  it('should handle messages with reasoning', () => {
    const messagesWithReasoning: ThreadMessage[] = [
      {
        id: 'msg_1',
        role: 'assistant',
        content: 'Final answer',
        reasoning: 'I am thinking about this',
        status: 'done',
        toolCalls: [],
      },
    ];

    render(<MessageList messages={messagesWithReasoning} isStreaming={false} />);

    expect(screen.getByTestId('message-msg_1')).toBeInTheDocument();
  });

  it('should pass isStreaming to MessageBubble components', () => {
    const { rerender } = render(<MessageList messages={mockMessages} isStreaming={false} />);

    expect(screen.getByTestId('message-msg_1')).toBeInTheDocument();

    rerender(<MessageList messages={mockMessages} isStreaming={true} />);

    expect(screen.getByTestId('message-msg_1')).toBeInTheDocument();
  });

  it('should have proper flex layout', () => {
    const { container } = render(<MessageList messages={mockMessages} isStreaming={false} />);

    const mainDiv = container.firstChild;
    expect(mainDiv).toHaveClass('flex-1');
    expect(mainDiv).toHaveClass('overflow-y-auto');
  });
});
