import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NewThreadButton from './NewThreadButton';

describe('NewThreadButton', () => {
  it('should render button with text', () => {
    const mockOnClick = vi.fn();
    render(<NewThreadButton onClick={mockOnClick} />);

    expect(screen.getByText('New Thread')).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    const mockOnClick = vi.fn();
    render(<NewThreadButton onClick={mockOnClick} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('should render with Plus icon', () => {
    const mockOnClick = vi.fn();
    render(<NewThreadButton onClick={mockOnClick} />);

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    // Check that it has the Plus icon (lucide-react icon)
    expect(button.querySelector('svg')).toBeInTheDocument();
  });

  it('should have correct styling classes', () => {
    const mockOnClick = vi.fn();
    render(<NewThreadButton onClick={mockOnClick} />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('flex');
    expect(button).toHaveClass('w-full');
    expect(button).toHaveClass('rounded-lg');
    expect(button).toHaveClass('bg-[#3b82f6]');
  });

  it('should call onClick multiple times on multiple clicks', () => {
    const mockOnClick = vi.fn();
    render(<NewThreadButton onClick={mockOnClick} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mockOnClick).toHaveBeenCalledTimes(3);
  });
});
