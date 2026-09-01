import { render, screen, fireEvent } from '@testing-library/react';
import StreamingRenderer from './StreamingRenderer';
import { describe, it, expect } from 'vitest';
import React from 'react';

describe('StreamingRenderer', () => {
  it('should render reasoning block and toggle expansion', () => {
    const reasoning = 'I am thinking about things';
    render(
      <StreamingRenderer reasoning={reasoning} answer="" toolCalls={[]} isStreaming={false} />
    );

    const toggleButton = screen.getByText('Show reasoning');
    expect(screen.queryByText(reasoning)).not.toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(screen.getByText('Hide reasoning')).toBeInTheDocument();
    expect(screen.getByText(reasoning)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Hide reasoning'));
    expect(screen.queryByText(reasoning)).not.toBeInTheDocument();
  });

  it('should render tool calls and toggle expansion', () => {
    const toolCalls = [
      {
        id: 'call-1',
        name: 'get_weather',
        args: '{"location": "San Francisco"}',
        result: 'Sunny, 72°F',
        expanded: false,
      },
    ];

    render(<StreamingRenderer answer="" toolCalls={toolCalls} isStreaming={false} />);

    expect(screen.getByText('get_weather')).toBeInTheDocument();

    // Arguments should not be visible initially
    expect(screen.queryByText(/San Francisco/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('get_weather'));

    expect(screen.getByText(/San Francisco/)).toBeInTheDocument();
    expect(screen.getByText(/Sunny, 72°F/)).toBeInTheDocument();
  });

  it('should show streaming cursor when isStreaming is true', () => {
    const { container } = render(
      <StreamingRenderer answer="Hello" toolCalls={[]} isStreaming={true} />
    );

    expect(screen.getByText('Hello')).toBeInTheDocument();
    // The cursor is a span with animate-pulse
    const cursor = container.querySelector('.animate-pulse');
    expect(cursor).toBeInTheDocument();
  });

  it('should render a wire A2UI tree instead of synthesizing fields', () => {
    const tree = {
      id: 'root',
      component: 'column' as const,
      gap: 'loose' as const,
      children: [
        { id: 'answer', component: 'markdown' as const, text: 'Wire markdown', streaming: false },
      ],
    };

    render(
      <StreamingRenderer
        reasoning="should not show"
        answer="fallback answer"
        toolCalls={[]}
        isStreaming={false}
        a2ui={tree}
      />
    );

    expect(screen.getByText('Wire markdown')).toBeInTheDocument();
    expect(screen.queryByText('fallback answer')).not.toBeInTheDocument();
    expect(screen.queryByText('Show reasoning')).not.toBeInTheDocument();
  });

  it('should handle empty tool results correctly', () => {
    const toolCalls = [
      {
        id: 'call-2',
        name: 'calculator',
        args: '2+2',
        expanded: false,
      },
    ];

    render(<StreamingRenderer answer="" toolCalls={toolCalls} isStreaming={false} />);

    fireEvent.click(screen.getByText('calculator'));
    expect(screen.getByText('2+2')).toBeInTheDocument();
    expect(screen.queryByText('Result')).not.toBeInTheDocument();
  });
});
