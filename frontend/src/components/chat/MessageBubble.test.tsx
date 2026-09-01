import { render, screen } from '@testing-library/react';
import MessageBubble from './MessageBubble';
import { describe, it, expect } from 'vitest';
import React from 'react';
import type { ThreadMessage } from '@/types';

describe('MessageBubble', () => {
  it('should render user message', () => {
    const message: ThreadMessage = {
      id: '1',
      role: 'user',
      content: 'Hello from user',
      status: 'done',
      toolCalls: [],
    };

    render(<MessageBubble message={message} />);
    expect(screen.getByText('Hello from user')).toBeInTheDocument();
  });

  it('should render error message', () => {
    const message: ThreadMessage = {
      id: '2',
      role: 'assistant',
      content: '',
      status: 'error',
      error: 'Something went wrong',
      toolCalls: [],
    };

    render(<MessageBubble message={message} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('should show streaming cursor only when this message is streaming', () => {
    const streaming: ThreadMessage = {
      id: '3',
      role: 'assistant',
      content: 'Hello from assistant',
      status: 'streaming',
      toolCalls: [],
    };
    const { container, rerender } = render(<MessageBubble message={streaming} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();

    rerender(<MessageBubble message={{ ...streaming, status: 'done' }} />);
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });

  it('should render assistant reasoning and content', () => {
    const message: ThreadMessage = {
      id: '3',
      role: 'assistant',
      content: 'Hello from assistant',
      reasoning: 'I am thinking about greeting you',
      status: 'done',
      toolCalls: [],
    };

    render(<MessageBubble message={message} />);
    expect(screen.getByText('Hello from assistant')).toBeInTheDocument();
    // Reasoning is hidden by default in StreamingRenderer (collapsed)
    expect(screen.getByText('Show reasoning')).toBeInTheDocument();
  });
});
