export interface ChatRequest {
  message: string;
  thread_id: string;
  job_id?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: string;
  result?: string;
  expanded: boolean;
}

export interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  toolCalls: ToolCall[];
  status: "streaming" | "done" | "error";
  error?: string;
}

export interface Thread {
  id: string;
  title: string;
  messages: ThreadMessage[];
  updatedAt: number;
}

export type SSEEventType =
  | "agent"
  | "reasoning"
  | "answer"
  | "tool_call"
  | "tool_result"
  | "error"
  | "done";

export interface SSEEvent {
  event: SSEEventType;
  data: string;
}
