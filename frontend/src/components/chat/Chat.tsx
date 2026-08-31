'use client';

import { useCallback, useRef } from 'react';
import { useThreadsContext } from '@/context/ThreadContext';
import { useThreadStore } from '@/context/ThreadContext';
import { useAuth } from '@/context/AuthContext';
import { useSSEStream } from '@/hooks/useSSEStream';
import type { SSEEvent, ThreadMessage } from '@/types';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import Sidebar from '@/components/sidebar/Sidebar';

/** Safely parses an AG-UI event's JSON `data` payload; `null` on malformed data. */
function parseEventData<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export default function Chat() {
  const storeRef = useThreadStore();
  const { activeThreadId } = useThreadsContext();
  const { token } = useAuth();

  // Use refs for streaming state to track the active message object
  const currentAssistantRef = useRef<ThreadMessage | null>(null);
  const isStreamingRef = useRef(false);
  const streamingTargetThreadIdRef = useRef<string | null>(null);

  const handleMessageEvent = useCallback(
    (event: SSEEvent) => {
      const store = storeRef.current;
      const targetThreadId = streamingTargetThreadIdRef.current;
      if (!targetThreadId) return;

      // Writes `msg` into the active thread's message list, creating the
      // entry if it isn't there yet.
      const mirror = (msg: ThreadMessage) => {
        const thread = store.threads.find((t: any) => t.id === targetThreadId);
        if (!thread) return;
        const msgs = [...thread.messages];
        const idx = msgs.findIndex((m: any) => m.id === msg.id);
        if (idx >= 0) {
          msgs[idx] = msg;
        } else {
          msgs.push(msg);
        }
        store.updateThreadMessages(targetThreadId, msgs);
      };

      const ensureAssistantMessage = (): ThreadMessage => {
        if (currentAssistantRef.current) return currentAssistantRef.current;
        const initial: ThreadMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '',
          reasoning: '',
          toolCalls: [],
          status: 'streaming',
        };
        currentAssistantRef.current = initial;
        mirror(initial);
        return initial;
      };

      const updateAssistantMessage = (updater: (msg: ThreadMessage) => ThreadMessage) => {
        const updated = updater(ensureAssistantMessage());
        currentAssistantRef.current = updated;
        mirror(updated);
      };

      // Finalizes the run: writes `finalMsg` into the thread, derives the
      // thread title from the first user message if this is its first
      // response, and resets all per-run streaming state. Shared by the
      // RUN_FINISHED and RUN_ERROR terminal paths.
      const finalizeRun = (finalMsg: ThreadMessage) => {
        const thread = store.threads.find((t: any) => t.id === targetThreadId);
        if (thread) {
          const msgs = [...thread.messages];
          const idx = msgs.findIndex((m: any) => m.id === finalMsg.id);
          if (idx >= 0) {
            msgs[idx] = finalMsg;
          } else {
            msgs.push(finalMsg);
          }
          store.updateThreadMessages(thread.id, msgs);

          if (thread.title === 'New Thread') {
            const firstUser = msgs.find((m: any) => m.role === 'user');
            if (firstUser) {
              const title =
                firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? '...' : '');
              store.updateThreadTitle(targetThreadId, title);
            }
          }
        }
        currentAssistantRef.current = null;
        isStreamingRef.current = false;
        streamingTargetThreadIdRef.current = null;
      };

      switch (event.event) {
        case 'RUN_ERROR': {
          const data = parseEventData<{ message?: string }>(event.data);
          const message = data?.message ?? event.data;
          const assistantMsg = currentAssistantRef.current;
          const errorMessage: ThreadMessage = assistantMsg
            ? { ...assistantMsg, status: 'done' as const, error: message }
            : {
                id: crypto.randomUUID(),
                role: 'assistant' as const,
                content: '',
                reasoning: '',
                toolCalls: [],
                status: 'done' as const,
                error: message,
              };
          finalizeRun(errorMessage);
          return;
        }

        case 'RUN_FINISHED': {
          const msg = currentAssistantRef.current;
          if (msg) {
            finalizeRun({ ...msg, status: 'done' as const });
          } else {
            // Run finished without ever producing assistant content —
            // nothing to write to the thread, just reset streaming state.
            currentAssistantRef.current = null;
            isStreamingRef.current = false;
            streamingTargetThreadIdRef.current = null;
          }
          return;
        }

        case 'REASONING_MESSAGE_CONTENT': {
          const data = parseEventData<{ delta?: string }>(event.data);
          const delta = data?.delta ?? '';
          updateAssistantMessage(msg => ({ ...msg, reasoning: (msg.reasoning || '') + delta }));
          return;
        }

        case 'TEXT_MESSAGE_CONTENT': {
          const data = parseEventData<{ delta?: string }>(event.data);
          const delta = data?.delta ?? '';
          updateAssistantMessage(msg => ({ ...msg, content: msg.content + delta }));
          return;
        }

        case 'TOOL_CALL_START': {
          const data = parseEventData<{ toolCallId?: string; toolCallName?: string }>(event.data);
          const toolCallId = data?.toolCallId || crypto.randomUUID();
          const toolCallName = data?.toolCallName || 'unknown';
          updateAssistantMessage(msg => ({
            ...msg,
            toolCalls: [
              ...msg.toolCalls,
              { id: toolCallId, name: toolCallName, args: '', expanded: false },
            ],
          }));
          return;
        }

        case 'TOOL_CALL_ARGS': {
          const data = parseEventData<{ toolCallId?: string; delta?: string }>(event.data);
          const toolCallId = data?.toolCallId;
          const delta = data?.delta ?? '';
          if (!toolCallId) return;
          updateAssistantMessage(msg => ({
            ...msg,
            toolCalls: msg.toolCalls.map(tc =>
              tc.id === toolCallId ? { ...tc, args: tc.args + delta } : tc
            ),
          }));
          return;
        }

        case 'TOOL_CALL_RESULT': {
          const data = parseEventData<{ toolCallId?: string; content?: string }>(event.data);
          const toolCallId = data?.toolCallId;
          const content = data?.content ?? '';
          if (!toolCallId) return;
          updateAssistantMessage(msg => ({
            ...msg,
            toolCalls: msg.toolCalls.map(tc =>
              tc.id === toolCallId ? { ...tc, result: content } : tc
            ),
          }));
          return;
        }

        // RUN_STARTED, STEP_STARTED/FINISHED, TEXT_MESSAGE_START/END,
        // REASONING_MESSAGE_START/END, TOOL_CALL_END, and the *_CHUNK
        // variants (not emitted by this backend today, see
        // backend/utils/streaming.py) are pure lifecycle/bracket markers —
        // no ThreadMessage state change needed for this app's rendering.
        default:
          return;
      }
    },
    [storeRef]
  );

  const stream = useSSEStream({
    onEvent: handleMessageEvent,
    token: token,
    onError: err => {
      const store = storeRef.current;
      const reliableTargetThreadId = streamingTargetThreadIdRef.current;

      const assistantMsg = currentAssistantRef.current;

      const errorMessage: ThreadMessage = assistantMsg
        ? { ...assistantMsg, status: 'done' as const, error: err }
        : {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: '',
            reasoning: '',
            toolCalls: [],
            status: 'done' as const,
            error: err,
          };

      currentAssistantRef.current = errorMessage;

      // Mirror to store
      if (reliableTargetThreadId) {
        const thread = store.threads.find((t: any) => t.id === reliableTargetThreadId);
        if (thread) {
          const msgs = [...thread.messages];
          const idx = msgs.findIndex((m: any) => m.id === errorMessage.id);
          if (idx >= 0) {
            msgs[idx] = errorMessage;
          } else {
            msgs.push(errorMessage);
          }
          store.updateThreadMessages(reliableTargetThreadId, msgs);
        }
      }

      isStreamingRef.current = false;
      streamingTargetThreadIdRef.current = null;
    },
  });

  const handleSend = useCallback(
    (text: string) => {
      const store = storeRef.current;
      if (!activeThreadId || isStreamingRef.current) return;

      const userMsg: ThreadMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        status: 'done',
        toolCalls: [],
      };

      const assistantMsg: ThreadMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        reasoning: '',
        toolCalls: [],
        status: 'streaming',
      };

      currentAssistantRef.current = assistantMsg;
      isStreamingRef.current = true;
      streamingTargetThreadIdRef.current = activeThreadId;

      const thread = store.threads.find((t: any) => t.id === activeThreadId);
      if (thread) {
        store.updateThreadMessages(activeThreadId, [...thread.messages, userMsg, assistantMsg]);
      }

      stream.start({ message: text, thread_id: activeThreadId });
    },
    [activeThreadId, stream, storeRef]
  );

  const currentThread = storeRef.current.threads.find((t: any) => t.id === activeThreadId);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <MessageList messages={currentThread?.messages || []} isStreaming={stream.isStreaming} />
        <div className="border-t border-[#262626]">
          <MessageInput
            onSend={handleSend}
            isStreaming={stream.isStreaming}
            isEmpty={!currentThread || currentThread.messages.length === 0}
          />
        </div>
      </div>
    </div>
  );
}
