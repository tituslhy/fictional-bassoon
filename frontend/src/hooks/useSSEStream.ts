import { useCallback, useRef, useState } from "react";
import type { SSEEvent, SSEEventType } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface UseSSEStreamOptions {
  onEvent: (event: SSEEvent) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
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

      fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      })
        .then(async (res) => {
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
          let buffer = "";
          let receivedDone = false;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const chunks = buffer.split("\n\n");
              buffer = chunks.pop() ?? "";

              for (const chunk of chunks) {
                const parsed = parseSSE(chunk);
                if (!parsed) continue;
                options.onEvent(parsed);
                if (parsed.event === "done") {
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
        .catch((err) => {
          if (err.name !== "AbortError") {
            options.onError?.(err.message);
            setIsStreaming(false);
          }
        });
    },
    [options],
  );

  return { isStreaming, start, stop };
}

function parseSSE(text: string): SSEEvent | null {
  const lines = text.split("\n");
  let event: SSEEventType = "reasoning";
  let data = "";
  let isFirstDataLine = true;

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim() as SSEEventType;
    }
    if (line.startsWith("data:")) {
      const payload = line.slice(5);
      if (isFirstDataLine) {
        data = payload;
        isFirstDataLine = false;
      } else {
        data += "\n" + payload;
      }
    }
  }

  if (!hasData) return null;
  return { event, data };
}