import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SurfaceRenderer } from './SurfaceRenderer';
import { surfaceFixture } from './surfaceFixture';

describe('interactive surface', () => {
  it('requires a choice, dispatches a standard action once, and retains the selection', async () => {
    let finish!: (ok: boolean) => void;
    const onAction = vi.fn(
      () =>
        new Promise<boolean>(resolve => {
          finish = resolve;
        })
    );
    render(<SurfaceRenderer surface={surfaceFixture()} onAction={onAction} />);
    const button = screen.getByRole('button', { name: 'Get recommendation' });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'FastAPI' }));
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(
      {
        version: 'v1.0',
        action: {
          name: 'select_option',
          surfaceId: 'surface-1',
          sourceComponentId: 'submit',
          timestamp: expect.any(String),
          context: { selection: ['fastapi'] },
        },
      },
      'FastAPI'
    );
    expect(screen.getByRole('radio', { name: 'Flask' })).toBeDisabled();
    await act(async () => finish(true));
    expect(screen.getByRole('radio', { name: 'FastAPI' })).toBeChecked();
    expect(button).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Selection sent');
  });
  it('keeps the selection and allows retry after a failed request', async () => {
    const onAction = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<SurfaceRenderer surface={surfaceFixture()} onAction={onAction} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Flask' }));
    fireEvent.click(screen.getByRole('button', { name: 'Get recommendation' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Try again'));
    expect(screen.getByRole('radio', { name: 'Flask' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Get recommendation' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Selection sent'));
    expect(onAction).toHaveBeenCalledTimes(2);
  });
  it('disables controls while the parent stream is active', () => {
    render(<SurfaceRenderer surface={surfaceFixture()} isStreaming onAction={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'FastAPI' })).toBeDisabled();
  });
  it('restores the submitted selection when remounted from history', () => {
    render(
      <SurfaceRenderer surface={surfaceFixture()} submittedSelection="flask" onAction={vi.fn()} />
    );
    expect(screen.getByRole('radio', { name: 'Flask' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Get recommendation' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Selection sent');
  });
  it('renders text literally and refuses malformed surfaces', () => {
    const surface = surfaceFixture();
    surface.createSurface.components[1].text = '<script>alert(1)</script>';
    const { container, rerender } = render(<SurfaceRenderer surface={surface} />);
    expect(screen.getByText('<script>alert(1)</script>')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    rerender(<SurfaceRenderer surface={{ version: 'v1.0' }} />);
    expect(screen.queryByRole('radio')).toBeNull();
  });
});
