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
}

export interface Thread {
  id: string;
  title: string;
  messages: ThreadMessage[];
  updatedAt: number;
}

// AG-UI protocol event types (ag-ui-protocol==0.1.21 EventType enum — see
// .claude/rules/protocol-version-pinning.md). This union replaces the legacy
// reasoning/tool_call/tool_result/answer/agent/error/done vocabulary.
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
  | 'TOOL_CALL_RESULT';

// TRANSITIONAL: the backend now emits only AG-UI events, but Chat.tsx /
// useSSEStream.ts still consume the legacy vocabulary via the a2ui mock
// shim. SSEEventType stays a union of both until the frontend consumption
// swap lands (tracked in REWRITE_TASKS.md — see lib/a2ui/mock/legacyShim.ts
// for the swap plan). Delete LegacySSEEventType with that swap.
export type LegacySSEEventType =
  | 'agent'
  | 'reasoning'
  | 'answer'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'done';

export type SSEEventType = AGUIEventType | LegacySSEEventType;

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
