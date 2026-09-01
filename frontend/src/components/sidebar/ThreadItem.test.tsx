import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ThreadItem from './ThreadItem';
import type { Thread } from '@/types';

describe('ThreadItem', () => {
  const mockThread: Thread = {
    id: 'thread_1',
    title: 'Test Thread',
    messages: [],
    updatedAt: 0,
  };

  it('should render thread title', () => {
    render(
      <ThreadItem thread={mockThread} isActive={false} onClick={vi.fn()} onDelete={vi.fn()} />
    );

    expect(screen.getByText('Test Thread')).toBeInTheDocument();
  });

  it('should call onClick when thread is clicked', () => {
    const mockOnClick = vi.fn();
    const { container } = render(
      <ThreadItem thread={mockThread} isActive={false} onClick={mockOnClick} onDelete={vi.fn()} />
    );

    // Click the thread title button (first button)
    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[0]);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('should show active styling when isActive is true', () => {
    const { container } = render(
      <ThreadItem thread={mockThread} isActive={true} onClick={vi.fn()} onDelete={vi.fn()} />
    );

    const itemDiv = container.querySelector('div[role="group"]');
    expect(itemDiv).toHaveClass('bg-[#1a1a1a]');
    expect(itemDiv).toHaveClass('text-[#e5e5e5]');
  });

  it('should show inactive styling when isActive is false', () => {
    const { container } = render(
      <ThreadItem thread={mockThread} isActive={false} onClick={vi.fn()} onDelete={vi.fn()} />
    );

    const itemDiv = container.querySelector('div[role="group"]');
    expect(itemDiv).toHaveClass('text-[#9ca3af]');
    expect(itemDiv).toHaveClass('hover:bg-[#1a1a1a]');
  });

  it('should call onDelete when delete button is clicked', () => {
    const mockOnDelete = vi.fn();
    render(
      <ThreadItem thread={mockThread} isActive={false} onClick={vi.fn()} onDelete={mockOnDelete} />
    );

    const deleteBtn = screen.getByLabelText('Delete Test Thread');
    fireEvent.click(deleteBtn);

    expect(mockOnDelete).toHaveBeenCalledTimes(1);
  });

  it('should stop propagation when delete button is clicked', () => {
    const mockOnClick = vi.fn();
    const mockOnDelete = vi.fn();
    render(
      <ThreadItem
        thread={mockThread}
        isActive={false}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    const deleteBtn = screen.getByLabelText('Delete Test Thread');
    const event = new MouseEvent('click', { bubbles: true });
    const stopPropagation = vi.spyOn(event, 'stopPropagation');

    fireEvent.click(deleteBtn, event);

    expect(mockOnDelete).toHaveBeenCalled();
    // Note: fireEvent handles this automatically, but we verify the behavior
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('should display correct icon for active state', () => {
    const { container } = render(
      <ThreadItem thread={mockThread} isActive={true} onClick={vi.fn()} onDelete={vi.fn()} />
    );

    const iconElement = container.querySelector('svg');
    expect(iconElement).toBeInTheDocument();
  });

  it('should truncate long thread titles', () => {
    const longThread: Thread = {
      id: 'thread_1',
      title: 'This is a very long thread title that should be truncated',
      messages: [],
      updatedAt: 0,
    };

    const { container } = render(
      <ThreadItem thread={longThread} isActive={false} onClick={vi.fn()} onDelete={vi.fn()} />
    );

    const titleSpan = container.querySelector('span.truncate');
    expect(titleSpan).toHaveTextContent(longThread.title);
    expect(titleSpan).toHaveClass('truncate');
  });
});
