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

  // Use refs for streaming state to avoid stale closures
  const currentAssistantRef = useRef<ThreadMessage | null>(null);
  const isStreamingRef = useRef(false);

  const handleMessageEvent = useCallback((event: SSEEvent) => {
    const store = storeRef.current;
    const assistantRef = currentAssistantRef;

    if (event.event === "agent") return;

    if (event.event === "error") {
      assistantRef.current = assistantRef.current
        ? { ...assistantRef.current, status: "done", error: event.data }
        : null;
      return;
    }

    // Create assistant message if it doesn't exist yet
    if (!assistantRef.current) {
      assistantRef.current = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        reasoning: "",
        toolCalls: [],
        status: "streaming",
      };
    }

    switch (event.event) {
      case "reasoning":
        assistantRef.current = {
          ...assistantRef.current,
          reasoning: (assistantRef.current.reasoning || "") + event.data,
        };
        break;

      case "answer":
        assistantRef.current = {
          ...assistantRef.current,
          content: assistantRef.current.content + event.data,
        };
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
        break;
      }

      case "done": {
        if (assistantRef.current) {
          const finalized = { ...assistantRef.current, status: "done" as const };
          const thread = store.threads.find((t) => t.id === activeThreadId);
          if (thread) {
            const msgs = [...thread.messages];
            const idx = msgs.findLastIndex((m) => m.role === "assistant" && m.status === "streaming");
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
                store.updateThreadTitle(thread.id, title);
              }
            }
          }
        }
        assistantRef.current = null;
        isStreamingRef.current = false;
        break;
      }
    }
  }, [storeRef, activeThreadId]);

  const stream = useSSEStream({
    onEvent: handleMessageEvent,
    onError: (err) => {
      if (!currentAssistantRef.current) {
        currentAssistantRef.current = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          reasoning: "",
          toolCalls: [],
          status: "done",
          error: err,
        };
      } else {
        currentAssistantRef.current = {
          ...currentAssistantRef.current,
          status: "done",
          error: err,
        };
      }
      isStreamingRef.current = false;
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

      let targetThreadId = activeThreadId;
      let thread = store.threads.find((t) => t.id === activeThreadId);

      if (!thread) {
        targetThreadId = crypto.randomUUID();
        const title = text.slice(0, 40) + (text.length > 40 ? "..." : "");
        thread = {
          id: targetThreadId,
          title,
          messages: [userMsg, assistantMsg],
          updatedAt: Date.now(),
        };
        store.updateThreadMessages(targetThreadId, thread.messages);
        store.setActiveThreadId(targetThreadId);
      } else {
        store.updateThreadMessages(targetThreadId, [...thread.messages, userMsg, assistantMsg]);
      }

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
          messages={currentThread?.messages.filter((m) => m.status === "done") || []}
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
