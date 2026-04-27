"use client";

import { useCallback, useRef } from "react";
import { useThreadsContext } from "@/context/ThreadContext";
import { useThreadStore } from "@/context/ThreadContext";
import { useAuth } from "@/context/AuthContext";
import { useSSEStream } from "@/hooks/useSSEStream";
import type { SSEEvent, ThreadMessage } from "@/types";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import Sidebar from "@/components/sidebar/Sidebar";

export default function Chat() {
  const storeRef = useThreadStore();
  const { activeThreadId } = useThreadsContext();
  const { token } = useAuth();

  // Use refs for streaming state to track the active message object
  const currentAssistantRef = useRef<ThreadMessage | null>(null);
  const isStreamingRef = useRef(false);
  const streamingTargetThreadIdRef = useRef<string | null>(null);

  const handleMessageEvent = useCallback((event: SSEEvent) => {
    const store = storeRef.current;
    const targetThreadId = streamingTargetThreadIdRef.current;
    if (!targetThreadId) return;

    if (event.event === "agent") return;

    if (event.event === "error") {
      const assistantMsg = currentAssistantRef.current;
      const errorMessage: ThreadMessage = assistantMsg
        ? { ...assistantMsg, status: "done" as const, error: event.data }
        : {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: "",
            reasoning: "",
            toolCalls: [],
            status: "done" as const,
            error: event.data,
          };
      currentAssistantRef.current = errorMessage;

      // Mirror to store
      if (targetThreadId) {
        const thread = store.threads.find((t) => t.id === targetThreadId);
        if (thread) {
          const msgs = [...thread.messages];
          const idx = msgs.findIndex((m) => m.id === errorMessage.id);
          if (idx >= 0) {
            msgs[idx] = errorMessage;
          } else {
            msgs.push(errorMessage);
          }
          store.updateThreadMessages(targetThreadId, msgs);
        }
      }
      return;
    }

    // Create assistant message if it doesn't exist yet
    if (!currentAssistantRef.current) {
      const initialAssistantMsg: ThreadMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        reasoning: "",
        toolCalls: [],
        status: "streaming",
      };
      currentAssistantRef.current = initialAssistantMsg;

      // Mirror initial creation to store
      if (targetThreadId) {
        const thread = store.threads.find((t) => t.id === targetThreadId);
        if (thread) {
          store.updateThreadMessages(targetThreadId, [...thread.messages, initialAssistantMsg]);
        }
      }
    }

    const msg = currentAssistantRef.current;
    if (!msg) return;

    switch (event.event) {
      case "reasoning": {
        const updatedMsg: ThreadMessage = {
          ...msg,
          reasoning: (msg.reasoning || "") + event.data,
        };
        currentAssistantRef.current = updatedMsg;

        // Mirror to store
        if (targetThreadId) {
          const thread = store.threads.find((t) => t.id === targetThreadId);
          if (thread) {
            const msgs = [...thread.messages];
            const idx = msgs.findIndex((m) => m.id === updatedMsg.id);
            if (idx >= 0) {
              msgs[idx] = updatedMsg;
              store.updateThreadMessages(targetThreadId, msgs);
            }
          }
        }
        break;
      }

      case "answer": {
        const updatedMsg: ThreadMessage = {
          ...msg,
          content: msg.content + event.data,
        };
        currentAssistantRef.current = updatedMsg;

        // Mirror to store
        if (targetThreadId) {
          const thread = store.threads.find((t) => t.id === targetThreadId);
          if (thread) {
            const msgs = [...thread.messages];
            const idx = msgs.findIndex((m) => m.id === updatedMsg.id);
            if (idx >= 0) {
              msgs[idx] = updatedMsg;
              store.updateThreadMessages(targetThreadId, msgs);
            }
          }
        }
        break;
      }

      case "tool_call": {
        let parsed: { name?: string; args?: unknown; id?: string; index?: number };
        try {
          parsed = JSON.parse(event.data);
        } catch {
          // Fallback for non-JSON data
          const match = event.data.match(/^([^(]+)\(([\s\S]*)\)$/);
          parsed = match ? { name: match[1], args: match[2] } : { name: "unknown", args: event.data };
        }

        // Aggregate tool calls by index or id, using trackingKey for reconciliation
        const toolCalls = [...(msg.toolCalls || [])];
        const existingIdx = toolCalls.findIndex(
          (tc) =>
            (parsed.id && tc.id === parsed.id) ||
            (parsed.id && tc.trackingKey === parsed.id) ||
            (parsed.index !== undefined && tc.index === parsed.index)
        );

        if (existingIdx >= 0) {
          // Update existing tool call
          const tc = toolCalls[existingIdx];
          toolCalls[existingIdx] = {
            ...tc,
            name: (parsed.name || tc.name || "unknown"),
            args: (tc.args || "") + (typeof parsed.args === "string" ? parsed.args : JSON.stringify(parsed.args || "")),
            id: parsed.id || tc.id,
            index: parsed.index !== undefined ? parsed.index : tc.index,
          };
        } else {
          // Create new tool call with tracking key
          const syntheticId = crypto.randomUUID();
          toolCalls.push({
            id: parsed.id || syntheticId,
            trackingKey: parsed.id || syntheticId,
            index: parsed.index,
            name: parsed.name || "unknown",
            args: typeof parsed.args === "string" ? parsed.args : JSON.stringify(parsed.args || ""),
            expanded: false,
          });
        }

        const updatedMsg: ThreadMessage = {
          ...msg,
          toolCalls,
        };
        currentAssistantRef.current = updatedMsg;

        // Mirror to store
        if (targetThreadId) {
          const thread = store.threads.find((t) => t.id === targetThreadId);
          if (thread) {
            const msgs = [...thread.messages];
            const idx = msgs.findIndex((m) => m.id === updatedMsg.id);
            if (idx >= 0) {
              msgs[idx] = updatedMsg;
              store.updateThreadMessages(targetThreadId, msgs);
            }
          }
        }
        break;
      }

      case "tool_result": {
        let resultData: { data: string; tool_call_id?: string } | string;
        try {
          resultData = JSON.parse(event.data);
        } catch {
          resultData = event.data;
        }

        const content = typeof resultData === "string" ? resultData : resultData.data;
        const toolCallId = typeof resultData === "object" ? resultData.tool_call_id : undefined;

        let fallbackApplied = false;
        const updatedMsg: ThreadMessage = {
          ...msg,
          toolCalls: (msg.toolCalls || []).map((tc) => {
            // Match by ID if available, otherwise match the first one without a result
            if (toolCallId && tc.id === toolCallId) {
              return { ...tc, result: content };
            }
            if (!toolCallId && !tc.result && !fallbackApplied) {
              fallbackApplied = true;
              return { ...tc, result: content };
            }
            return tc;
          }),
        };
        currentAssistantRef.current = updatedMsg;

        // Mirror to store
        if (targetThreadId) {
          const thread = store.threads.find((t) => t.id === targetThreadId);
          if (thread) {
            const msgs = [...thread.messages];
            const idx = msgs.findIndex((m) => m.id === updatedMsg.id);
            if (idx >= 0) {
              msgs[idx] = updatedMsg;
              store.updateThreadMessages(targetThreadId, msgs);
            }
          }
        }
        break;
      }

      case "done": {
        if (targetThreadId) {
          const finalized: ThreadMessage = { ...msg, status: "done" as const };
          const thread = store.threads.find((t) => t.id === targetThreadId);
          if (thread) {
            const msgs = [...thread.messages];
            const idx = msgs.findIndex((m) => m.id === finalized.id);
            if (idx >= 0) {
              msgs[idx] = finalized;
            } else {
              msgs.push(finalized);
            }
            store.updateThreadMessages(thread.id, msgs);

            if (thread.title === "New Thread") {
              const firstUser = msgs.find((m) => m.role === "user");
              if (firstUser) {
                const title = firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? "..." : "");
                store.updateThreadTitle(targetThreadId, title);
              }
            }
          }
        }
        currentAssistantRef.current = null;
        isStreamingRef.current = false;
        streamingTargetThreadIdRef.current = null;
        break;
      }
    }
  }, [storeRef, activeThreadId]);

  const stream = useSSEStream({
    onEvent: handleMessageEvent,
    token: token,
    onError: (err) => {
      const store = storeRef.current;
      const targetThreadId = window.location.pathname.split("/").pop(); // Or some other way to get the target thread ID reliably if not activeThreadId
      // Actually streamingTargetThreadIdRef.current is the most reliable
      const reliableTargetThreadId = streamingTargetThreadIdRef.current;
      
      const assistantMsg = currentAssistantRef.current;

      const errorMessage: ThreadMessage = assistantMsg
        ? { ...assistantMsg, status: "done" as const, error: err }
        : {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: "",
            reasoning: "",
            toolCalls: [],
            status: "done" as const,
            error: err,
          };

      currentAssistantRef.current = errorMessage;

      // Mirror to store
      if (reliableTargetThreadId) {
        const thread = store.threads.find((t) => t.id === reliableTargetThreadId);
        if (thread) {
          const msgs = [...thread.messages];
          const idx = msgs.findIndex((m) => m.id === errorMessage.id);
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
        role: "user",
        content: text,
        status: "done",
        toolCalls: [],
      };

      const assistantMsg: ThreadMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        reasoning: "",
        toolCalls: [],
        status: "streaming",
      };

      currentAssistantRef.current = assistantMsg;
      isStreamingRef.current = true;
      streamingTargetThreadIdRef.current = activeThreadId;

      const thread = store.threads.find((t) => t.id === activeThreadId);
      if (thread) {
        store.updateThreadMessages(activeThreadId, [...thread.messages, userMsg, assistantMsg]);
      }

      stream.start({ message: text, thread_id: activeThreadId });
    },
    [activeThreadId, stream, storeRef],
  );

  const currentThread = storeRef.current.threads.find((t) => t.id === activeThreadId);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <MessageList
          messages={currentThread?.messages || []}
          isStreaming={stream.isStreaming}
        />
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
