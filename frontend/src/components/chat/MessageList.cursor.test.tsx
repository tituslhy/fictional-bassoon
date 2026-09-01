import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MessageList from './MessageList';
import type { ThreadMessage } from '@/types';

HTMLElement.prototype.scrollIntoView = vi.fn();

describe('MessageList cursor', () => {
  it('shows a blinking cursor only on the in-progress assistant bubble', () => {
    const messages: ThreadMessage[] = [
      {
        id: 'old',
        role: 'assistant',
        content: 'Old answer',
        status: 'done',
        toolCalls: [],
      },
      {
        id: 'live',
        role: 'assistant',
        content: 'New',
        status: 'streaming',
        toolCalls: [],
      },
    ];

    const { container } = render(<MessageList messages={messages} isStreaming={true} />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(1);
  });
});
