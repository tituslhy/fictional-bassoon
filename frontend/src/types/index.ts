import type { A2UIComponentNode } from '@/lib/a2ui/schema';

export interface ChatRequest {
  message: string;
  thread_id: string;
  job_id?: string;
}

export interface ToolCall {
  id: string;
  trackingKey?: string;
  index?: number;
  name: string;
  args: string;
  result?: string;
  expanded: boolean;
}

export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  toolCalls: ToolCall[];
  status: 'streaming' | 'done' | 'error';
  error?: string;
  /** Wire A2UI tree from AG-UI CUSTOM name=a2ui. Absent on history hydrate. */
  a2ui?: A2UIComponentNode;
}

export interface Thread {
  id: string;
  title: string;
  messages: ThreadMessage[];
  updatedAt: number;
}

// AG-UI protocol event types (ag-ui-protocol==0.1.21 EventType enum — see
// .claude/rules/protocol-version-pinning.md). This is the vocabulary the
// backend emits on /chat's SSE stream (backend/utils/streaming.py) and the
// only vocabulary the frontend consumes — the legacy pre-AG-UI vocabulary
// (reasoning/tool_call/tool_result/answer/agent/error/done) has been fully
// retired from the frontend.
export type AGUIEventType =
  | 'RUN_STARTED'
  | 'RUN_FINISHED'
  | 'RUN_ERROR'
  | 'STEP_STARTED'
  | 'STEP_FINISHED'
  | 'TEXT_MESSAGE_START'
  | 'TEXT_MESSAGE_CONTENT'
  | 'TEXT_MESSAGE_END'
  | 'TEXT_MESSAGE_CHUNK'
  | 'REASONING_MESSAGE_START'
  | 'REASONING_MESSAGE_CONTENT'
  | 'REASONING_MESSAGE_END'
  | 'REASONING_MESSAGE_CHUNK'
  | 'TOOL_CALL_START'
  | 'TOOL_CALL_ARGS'
  | 'TOOL_CALL_END'
  | 'TOOL_CALL_CHUNK'
  | 'TOOL_CALL_RESULT'
  | 'CUSTOM';

export type SSEEventType = AGUIEventType;

export interface SSEEvent {
  event: SSEEventType;
  data: string;
}

// Authentication Types
export interface User {
  id: string;
  email: string;
  full_name?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}
