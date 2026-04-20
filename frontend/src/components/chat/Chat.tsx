"use client";

import { useCallback, useRef } from "react";
import { useThreadsContext } from "@/context/ThreadContext";
import { useThreadStore } from "@/context/ThreadContext";
import { useSSEStream } from "@/hooks/useSSEStream";
import type { SSEEvent, ThreadMessage, ToolCall } from "@/types";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import Sidebar from "@/components/sidebar/Sidebar";

export default function Chat() {
  const storeRef = useThreadStore();
  const { activeThreadId } = useThreadsContext();

  // Use refs for streaming state to track the active message object
  const currentAssistantRef = useRef<ThreadMessage | null>(null);
  const isStreamingRef = useRef(false);
  const streamingTargetThreadIdRef = useRef<string | null>(null);

  const handleMessageEvent = useCallback((event: SSEEvent) => {
    const store = storeRef.current;
    const assistantRef = currentAssistantRef;
    const targetThreadId = streamingTargetThreadIdRef.current;
    if (!activeThreadId) return;

    if (event.event === "agent") return;

    if (event.event === "error") {
      const errorMessage = assistantRef.current
        ? { ...assistantRef.current, status: "done" as const, error: event.data }
        : {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: "",
            reasoning: "",
            toolCalls: [],
            status: "done" as const,
            error: event.data,
          };
      assistantRef.current = errorMessage;

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
      currentAssistantRef.current = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        reasoning: "",
        toolCalls: [],
        status: "streaming",
      };

      // Mirror initial creation to store
      if (targetThreadId) {
        const thread = store.threads.find((t) => t.id === targetThreadId);
        if (thread) {
          store.updateThreadMessages(targetThreadId, [...thread.messages, assistantRef.current]);
        }
      }
    }

    switch (event.event) {
      case "reasoning":
        assistantRef.current = {
          ...assistantRef.current,
          reasoning: (assistantRef.current.reasoning || "") + event.data,
        };

        // Mirror to store
        if (targetThreadId) {
          const thread = store.threads.find((t) => t.id === targetThreadId);
          if (thread) {
            const msgs = [...thread.messages];
            const idx = msgs.findIndex((m) => m.id === assistantRef.current?.id);
            if (idx >= 0) {
              msgs[idx] = assistantRef.current;
              store.updateThreadMessages(targetThreadId, msgs);
            }
          }
        }
        break;

      case "answer":
        assistantRef.current = {
          ...assistantRef.current,
          content: assistantRef.current.content + event.data,
        };

        // Mirror to store
        if (targetThreadId) {
          const thread = store.threads.find((t) => t.id === targetThreadId);
          if (thread) {
            const msgs = [...thread.messages];
            const idx = msgs.findIndex((m) => m.id === assistantRef.current?.id);
            if (idx >= 0) {
              msgs[idx] = assistantRef.current;
              store.updateThreadMessages(targetThreadId, msgs);
            }
          }
        }
        break;

        case "tool_call": {
          let parsed: { name: string; args: string };
          try {
            const obj = JSON.parse(event.data);
            if (obj.name && obj.args) {
              parsed = obj;
            } else {
              const match = event.data.match(/^([^(]+)\(([\s\S]*)\)$/);
              parsed = match ? { name: match[1], args: match[2] } : { name: "unknown", args: event.data };
            }
          } catch {
            const match = event.data.match(/^([^(]+)\(([\s\S]*)\)$/);
            parsed = match ? { name: match[1], args: match[2] } : { name: "unknown", args: event.data };
          }

        const newToolCall: ToolCall = {
          id: crypto.randomUUID(),
          name: parsed.name,
          args: parsed.args,
          expanded: false,
        };
        assistantRef.current = {
          ...assistantRef.current,
          toolCalls: [...assistantRef.current.toolCalls, newToolCall],
        };

        // Mirror to store
        if (targetThreadId) {
          const thread = store.threads.find((t) => t.id === targetThreadId);
          if (thread) {
            const msgs = [...thread.messages];
            const idx = msgs.findIndex((m) => m.id === assistantRef.current?.id);
            if (idx >= 0) {
              msgs[idx] = assistantRef.current;
              store.updateThreadMessages(targetThreadId, msgs);
            }
          }
        }
        break;
      }

      case "tool_result": {
        let content: string;
        try {
          JSON.parse(event.data);
          content = event.data;
        } catch {
          content = event.data;
        }
        assistantRef.current = {
          ...assistantRef.current,
          toolCalls: assistantRef.current.toolCalls.map((tc) =>
            tc.result ? tc : { ...tc, result: content },
          ),
        };

        // Mirror to store
        if (targetThreadId) {
          const thread = store.threads.find((t) => t.id === targetThreadId);
          if (thread) {
            const msgs = [...thread.messages];
            const idx = msgs.findIndex((m) => m.id === assistantRef.current?.id);
            if (idx >= 0) {
              msgs[idx] = assistantRef.current;
              store.updateThreadMessages(targetThreadId, msgs);
            }
          }
        }
        break;
      }
    }

    currentAssistantRef.current = updatedMsg;

      case "done": {
        if (assistantRef.current && targetThreadId) {
          const finalized = { ...assistantRef.current, status: "done" as const };
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

      if (event.event === "done") {
        if (thread.title === "New Thread") {
          const firstUser = msgs.find((m) => m.role === "user");
          if (firstUser) {
            const title = firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? "..." : "");
            store.updateThreadTitle(activeThreadId, title);
          }
        }
        currentAssistantRef.current = null;
        isStreamingRef.current = false;
        streamingTargetThreadIdRef.current = null;
        break;
      }
    }
  }, [storeRef]);

  const stream = useSSEStream({
    onEvent: handleMessageEvent,
    onError: (err) => {
      const store = storeRef.current;
      const targetThreadId = streamingTargetThreadIdRef.current;

      const errorMessage = currentAssistantRef.current
        ? { ...currentAssistantRef.current, status: "done" as const, error: err }
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

      const thread = store.threads.find((t) => t.id === activeThreadId);
      if (thread) {
        store.updateThreadMessages(activeThreadId, [...thread.messages, userMsg, assistantMsg]);
      }

      streamingTargetThreadIdRef.current = targetThreadId;
      stream.start({ message: text, thread_id: targetThreadId });
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