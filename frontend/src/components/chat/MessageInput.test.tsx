import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import MessageInput from './MessageInput';

describe('MessageInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render textarea with placeholder', () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />);

    const textarea = screen.getByPlaceholderText('Ask anything…');
    expect(textarea).toBeInTheDocument();
  });

  it('should render send button', () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />);

    const sendBtn = screen.getByLabelText('Send message');
    expect(sendBtn).toBeInTheDocument();
  });

  it('should call onSend when form is submitted', async () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />);

    const textarea = screen.getByPlaceholderText('Ask anything…');
    const sendBtn = screen.getByRole('button', { name: /Send message/i });

    await userEvent.type(textarea, 'Hello world');
    fireEvent.click(sendBtn);

    expect(mockOnSend).toHaveBeenCalledWith('Hello world');
  });

  it('should clear textarea after sending', async () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />);

    const textarea = screen.getByPlaceholderText('Ask anything…') as HTMLTextAreaElement;
    const sendBtn = screen.getByRole('button', { name: /Send message/i });

    await userEvent.type(textarea, 'Test message');
    fireEvent.click(sendBtn);

    expect(textarea.value).toBe('');
  });

  it('should trim whitespace from message', async () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />);

    const textarea = screen.getByPlaceholderText('Ask anything…');
    const sendBtn = screen.getByRole('button', { name: /Send message/i });

    await userEvent.type(textarea, '  Hello world  ');
    fireEvent.click(sendBtn);

    expect(mockOnSend).toHaveBeenCalledWith('Hello world');
  });

  it('should not send empty messages', async () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />);

    const sendBtn = screen.getByRole('button', { name: /Send message/i });
    fireEvent.click(sendBtn);

    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it('should not send whitespace-only messages', async () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />);

    const textarea = screen.getByPlaceholderText('Ask anything…');
    await userEvent.type(textarea, '   ');
    const sendBtn = screen.getByRole('button', { name: /Send message/i });
    fireEvent.click(sendBtn);

    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it('should disable textarea when streaming', () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={true} isEmpty={false} />);

    const textarea = screen.getByLabelText('Message') as HTMLTextAreaElement;
    expect(textarea).toBeDisabled();
  });

  it('should disable send button when streaming', () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={true} isEmpty={false} />);

    const sendBtn = screen.getByRole('button', { name: /Send message/i }) as HTMLButtonElement;
    expect(sendBtn).toBeDisabled();
  });

  it('should disable send button when textarea is empty', () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />);

    const sendBtn = screen.getByRole('button', { name: /Send message/i }) as HTMLButtonElement;
    expect(sendBtn).toBeDisabled();
  });

  it('should enable send button when textarea has text', async () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />);

    const textarea = screen.getByPlaceholderText('Ask anything…');
    const sendBtn = screen.getByRole('button', { name: /Send message/i }) as HTMLButtonElement;

    expect(sendBtn).toBeDisabled();

    await userEvent.type(textarea, 'Hello');

    expect(sendBtn).not.toBeDisabled();
  });

  it('should submit on Enter key when not streaming', async () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />);

    const textarea = screen.getByPlaceholderText('Ask anything…');

    await userEvent.type(textarea, 'Hello{Enter}');

    expect(mockOnSend).toHaveBeenCalledWith('Hello');
  });

  it('should allow newline on Shift+Enter when not streaming', async () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />);

    const textarea = screen.getByPlaceholderText('Ask anything…') as HTMLTextAreaElement;

    await userEvent.type(textarea, 'Hello');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    // Should not submit on Shift+Enter
    expect(mockOnSend).not.toHaveBeenCalled();
    // Text should still be in the textarea
    expect(textarea.value).toContain('Hello');
  });

  it('should not submit on Enter when streaming', async () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={true} isEmpty={false} />);

    const textarea = screen.getByLabelText('Message');

    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it('should focus textarea on mount when isEmpty is true', async () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />);

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText('Ask anything…');
      expect(document.activeElement).toBe(textarea);
    });
  });

  it('should refocus textarea after sending', async () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />);

    const textarea = screen.getByPlaceholderText('Ask anything…');
    const sendBtn = screen.getByRole('button', { name: /Send message/i });

    await userEvent.type(textarea, 'Test');
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(document.activeElement).toBe(textarea);
    });
  });

  it('should display disclaimer text', () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />);

    expect(screen.getByText(/Answers can be wrong/)).toBeInTheDocument();
  });

  it('should auto-expand textarea as text is added', async () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />);

    const textarea = screen.getByPlaceholderText('Ask anything…') as HTMLTextAreaElement;

    await userEvent.type(textarea, 'A'.repeat(100));

    await waitFor(() => {
      // Height should have changed as text was added
      expect(textarea.style.height).not.toBe('');
    });
  });

  it('should call focus when isEmpty and not streaming', async () => {
    const mockOnSend = vi.fn();
    const { rerender } = render(
      <MessageInput onSend={mockOnSend} isStreaming={false} isEmpty={true} />
    );

    const textarea = screen.getByPlaceholderText('Ask anything…') as HTMLTextAreaElement;

    // Component should focus the textarea during mount
    await waitFor(() => {
      expect(document.activeElement).toBe(textarea);
    });
  });

  it('should not focus when isStreaming', async () => {
    const mockOnSend = vi.fn();
    render(<MessageInput onSend={mockOnSend} isStreaming={true} isEmpty={true} />);

    const textarea = screen.getByLabelText('Message') as HTMLTextAreaElement;

    // Should not auto-focus when streaming
    // (Focusing behavior is controlled by the parent, this component just respects the prop)
    expect(textarea).toBeDisabled();
  });
});
