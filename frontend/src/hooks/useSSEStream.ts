import { useCallback, useRef, useState } from 'react';
import type { SSEEvent, SSEEventType } from '@/types';
import type { A2UIComponentNode } from '@/lib/a2ui/schema';
import { validateComponentTree } from '@/lib/a2ui/validator';
import {
  createEmptyA2UIStreamState,
  applyMockAGUIEvent,
  streamStateToA2UITree,
} from '@/lib/a2ui/mock/streamState';
import { legacySSEEventToMockAGUIEvent } from '@/lib/a2ui/mock/legacyShim';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface UseSSEStreamOptions {
  onEvent: (event: SSEEvent) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
  token?: string | null;
  /**
   * Optional: receives an A2UI component tree rebuilt after each frame.
   *
   * This is scaffolding, not the production integration — it runs today's
   * legacy SSE frames through a TEMPORARY shim
   * (`lib/a2ui/mock/legacyShim.ts`) into a mocked AG-UI event shape, then
   * through the same tree builder that will eventually consume real AG-UI
   * events directly. See that file for exactly what to delete once the
   * backend's real AG-UI vocabulary lands. The SSE transport itself
   * (fetch + reader, below) is untouched by any of this —
   * `sse-transport-lock.md`.
   */
  onA2UITree?: (tree: A2UIComponentNode) => void;
}

export function useSSEStream(options: UseSSEStreamOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const start = useCallback(
    (body: { message: string; thread_id: string; job_id?: string }) => {
      abortRef.current = new AbortController();
      setIsStreaming(true);

      // Scaffolding for the A2UI mock event pipeline (see `onA2UITree` doc
      // comment above) — inert unless a caller passes `onA2UITree`.
      let a2uiState = createEmptyA2UIStreamState();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (options.token) {
        headers['Authorization'] = `Bearer ${options.token}`;
      }

      fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      })
        .then(async res => {
          if (!res.ok) {
            setIsStreaming(false);
            options.onError?.(`HTTP ${res.status}: ${res.statusText}`);
            return;
          }

          if (!res.body) {
            setIsStreaming(false);
            options.onComplete?.();
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let receivedDone = false;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const chunks = buffer.split('\n\n');
              buffer = chunks.pop() ?? '';

              for (const chunk of chunks) {
                const parsed = parseSSE(chunk);
                if (!parsed) continue;
                options.onEvent(parsed);
                if (options.onA2UITree) {
                  a2uiState = applyMockA2UIFrame(a2uiState, parsed, options.onA2UITree);
                }
                if (parsed.event === 'done') {
                  receivedDone = true;
                  options.onComplete?.();
                  setIsStreaming(false);
                  return;
                }
              }
            }

            // Stream ended without "done" event
            if (!receivedDone) {
              setIsStreaming(false);
              options.onComplete?.();
            }
          } finally {
            reader.releaseLock();
          }
        })
        .catch(err => {
          if (err.name !== 'AbortError') {
            options.onError?.(err.message);
            setIsStreaming(false);
          }
        });
    },
    [options]
  );

  return { isStreaming, start, stop };
}

function parseSSE(text: string): SSEEvent | null {
  const lines = text.split('\n');
  let event: SSEEventType = 'reasoning';
  let data = '';
  let hasData = false;

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim() as SSEEventType;
    } else if (line.startsWith('data:')) {
      let payload = line.slice(5);
      // SSE spec: If value starts with a space, remove it
      if (payload.startsWith(' ')) {
        payload = payload.slice(1);
      }

      if (!hasData) {
        data = payload;
        hasData = true;
      } else {
        data += '\n' + payload;
      }
    }
  }

  if (!hasData) return null;
  return { event, data };
}

/**
 * Runs one legacy SSE frame through the temporary mock-AG-UI bridge (see
 * `onA2UITree` doc comment above and `lib/a2ui/mock/legacyShim.ts`),
 * updates the running accumulator, validates the resulting tree, and
 * reports it. Validation failures are logged rather than thrown — a bad
 * A2UI tree here is a scaffolding bug, not a reason to tear down the SSE
 * stream (`sse-transport-lock.md` — the transport keeps running regardless).
 */
function applyMockA2UIFrame(
  state: ReturnType<typeof createEmptyA2UIStreamState>,
  frame: SSEEvent,
  onA2UITree: (tree: A2UIComponentNode) => void
): ReturnType<typeof createEmptyA2UIStreamState> {
  const mockEvent = legacySSEEventToMockAGUIEvent(frame);
  if (!mockEvent) return state;

  const nextState = applyMockAGUIEvent(state, mockEvent);
  try {
    onA2UITree(validateComponentTree(streamStateToA2UITree(nextState)));
  } catch (err) {
    console.error('A2UI mock tree validation failed', err);
  }
  return nextState;
}
