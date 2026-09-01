'use client';

import { useCallback, useRef } from 'react';
import { useThreadsContext, useThreadStore } from '@/context/ThreadContext';
import { useAuth } from '@/context/AuthContext';
import { useSSEStream } from '@/hooks/useSSEStream';
import type { SSEEvent, Thread, ThreadMessage } from '@/types';
import type { A2UIComponentNode } from '@/lib/a2ui/schema';
import { validateComponentTree } from '@/lib/a2ui/validator';
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
  const { activeThreadId, createThread } = useThreadsContext();
  const { token } = useAuth();

  const currentAssistantRef = useRef<ThreadMessage | null>(null);
  const isStreamingRef = useRef(false);
  const streamingTargetThreadIdRef = useRef<string | null>(null);

  const handleMessageEvent = useCallback(
    (event: SSEEvent) => {
      const store = storeRef.current;
      const targetThreadId = streamingTargetThreadIdRef.current;
      if (!targetThreadId) return;

      const mirror = (msg: ThreadMessage) => {
        const thread = store.threads.find((t: Thread) => t.id === targetThreadId);
        if (!thread) return;
        const msgs = [...thread.messages];
        const idx = msgs.findIndex((m: ThreadMessage) => m.id === msg.id);
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

      const finalizeRun = (finalMsg: ThreadMessage) => {
        const thread = store.threads.find((t: Thread) => t.id === targetThreadId);
        if (thread) {
          const msgs = [...thread.messages];
          const idx = msgs.findIndex((m: ThreadMessage) => m.id === finalMsg.id);
          if (idx >= 0) {
            msgs[idx] = finalMsg;
          } else {
            msgs.push(finalMsg);
          }
          store.updateThreadMessages(thread.id, msgs);

          if (thread.title === 'New Thread' || thread.title === 'New chat') {
            const firstUser = msgs.find((m: ThreadMessage) => m.role === 'user');
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
            ? { ...assistantMsg, status: 'error' as const, error: message }
            : {
                id: crypto.randomUUID(),
                role: 'assistant' as const,
                content: '',
                reasoning: '',
                toolCalls: [],
                status: 'error' as const,
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
            currentAssistantRef.current = null;
            isStreamingRef.current = false;
            streamingTargetThreadIdRef.current = null;
          }
          return;
        }

        case 'CUSTOM': {
          const data = parseEventData<{ name?: string; value?: A2UIComponentNode }>(event.data);
          if (data?.name !== 'a2ui' || data.value == null) return;
          try {
            const tree = validateComponentTree(data.value);
            updateAssistantMessage(msg => ({ ...msg, a2ui: tree }));
          } catch {
            // Invalid tree: keep the AG-UI field fallback (buildLegacyStreamTree).
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

        default:
          return;
      }
    },
    [storeRef]
  );

  const unlockIfStillStreaming = useCallback(() => {
    if (!isStreamingRef.current) return;
    const store = storeRef.current;
    const targetThreadId = streamingTargetThreadIdRef.current;
    const msg = currentAssistantRef.current;
    if (msg && msg.status === 'streaming' && targetThreadId) {
      const finalMsg: ThreadMessage = { ...msg, status: 'done' };
      const thread = store.threads.find((t: Thread) => t.id === targetThreadId);
      if (thread) {
        const msgs = [...thread.messages];
        const idx = msgs.findIndex((m: ThreadMessage) => m.id === finalMsg.id);
        if (idx >= 0) {
          msgs[idx] = finalMsg;
        } else {
          msgs.push(finalMsg);
        }
        store.updateThreadMessages(targetThreadId, msgs);
      }
    }
    currentAssistantRef.current = null;
    isStreamingRef.current = false;
    streamingTargetThreadIdRef.current = null;
  }, [storeRef]);

  const stream = useSSEStream({
    onEvent: handleMessageEvent,
    token: token,
    onComplete: unlockIfStillStreaming,
    onError: err => {
      const store = storeRef.current;
      const reliableTargetThreadId = streamingTargetThreadIdRef.current;

      const assistantMsg = currentAssistantRef.current;

      const errorMessage: ThreadMessage = assistantMsg
        ? { ...assistantMsg, status: 'error' as const, error: err }
        : {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: '',
            reasoning: '',
            toolCalls: [],
            status: 'error' as const,
            error: err,
          };

      currentAssistantRef.current = errorMessage;

      if (reliableTargetThreadId) {
        const thread = store.threads.find((t: Thread) => t.id === reliableTargetThreadId);
        if (thread) {
          const msgs = [...thread.messages];
          const idx = msgs.findIndex((m: ThreadMessage) => m.id === errorMessage.id);
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
    async (text: string) => {
      const store = storeRef.current;
      if (isStreamingRef.current) return;

      let threadId = activeThreadId;
      if (!threadId) {
        threadId = await createThread();
      }
      if (!threadId) return;

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
      streamingTargetThreadIdRef.current = threadId;

      const thread = store.threads.find((t: Thread) => t.id === threadId);
      if (thread) {
        store.updateThreadMessages(threadId, [...thread.messages, userMsg, assistantMsg]);
      }

      stream.start({ message: text, thread_id: threadId });
    },
    [activeThreadId, stream, storeRef, createThread]
  );

  const currentThread = storeRef.current.threads.find((t: Thread) => t.id === activeThreadId);
  const messages = currentThread?.messages || [];
  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-screen bg-transparent text-zinc-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/5 px-6">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium text-zinc-100">
              {currentThread?.title && currentThread.title !== 'New chat'
                ? currentThread.title
                : 'New chat'}
            </h1>
            <p className="text-[11px] text-zinc-500">Reasoning agent with live web search</p>
          </div>
          <span className="hidden shrink-0 rounded-full bg-indigo-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-indigo-300 ring-1 ring-indigo-400/20 sm:inline">
            Web search
          </span>
        </header>
        <MessageList messages={messages} isStreaming={stream.isStreaming} onPrompt={handleSend} />
        <MessageInput onSend={handleSend} isStreaming={stream.isStreaming} isEmpty={isEmpty} />
      </div>
    </div>
  );
}
