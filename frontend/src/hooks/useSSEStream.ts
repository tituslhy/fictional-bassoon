import { useCallback, useRef, useState } from 'react';
import type { SSEEvent, SSEEventType } from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/** Terminal AG-UI event types — either one ends the run (never both, see
 * backend/utils/streaming.py's stream_agent_events docstring). */
const TERMINAL_EVENTS: ReadonlySet<SSEEventType> = new Set<SSEEventType>([
  'RUN_FINISHED',
  'RUN_ERROR',
]);

interface UseSSEStreamOptions {
  onEvent: (event: SSEEvent) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
  token?: string | null;
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
          let receivedTerminalEvent = false;

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
                if (TERMINAL_EVENTS.has(parsed.event)) {
                  receivedTerminalEvent = true;
                  options.onComplete?.();
                  setIsStreaming(false);
                  return;
                }
              }
            }

            // Stream ended without a terminal (RUN_FINISHED/RUN_ERROR) event
            if (!receivedTerminalEvent) {
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
  let event: SSEEventType | null = null;
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

  if (!hasData || event === null) return null;
  return { event, data };
}
