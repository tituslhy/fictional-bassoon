# Frontend

Next.js chat application for the fictional-bassoon AI agent.

## Overview

This is a real-time chat interface that streams agent reasoning, tool calls, tool results, and final answers via Server-Sent Events (SSE). Users can start new conversation threads, view streaming agent activity, and see responses rendered with markdown support.

The frontend consists of two main panels:

1. **Sidebar** — List of conversation threads with a "New Thread" button
2. **Chat area** — Message list with streaming renderer and user input form

## Tech Stack

| Technology | Purpose |
|---|---|
| Next.js 14 (App Router) | React framework |
| TypeScript (strict mode) | Type safety |
| Tailwind CSS | Utility-first styling |
| react-markdown + remark-gfm | Markdown content rendering |
| Lucide React | Icon library |
| Custom SSE hook | Real-time event consumption |

## Installation

```bash
cd frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local 2>/dev/null || echo 'NEXT_PUBLIC_API_URL=http://localhost:8000' > .env.local
```

## Running the App

```bash
# Start the dev server
npm run dev

# Open http://localhost:3000 in your browser
```

## Environment Variables

Create a `.env.local` file in the `frontend/` directory:

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend SSE endpoint base URL |

## Project Structure

```
frontend/
├── package.json                 # Node dependencies
├── next.config.mjs              # Next.js config
├── next.config.ts               # TypeScript Next.js config
├── tailwind.config.ts           # Tailwind CSS config
├── tsconfig.json                # TypeScript config
├── postcss.config.mjs           # PostCSS config
├── .env.local                   # Environment variables
├── .eslintrc.json               # ESLint config
│
└── src/
    ├── app/
    │   ├── layout.tsx           # Root layout
    │   │                        # - ThreadProvider wrapper
    │   │                        # - Inter font (Google Fonts)
    │   │                        # - Dark mode (html.dark)
    │   │
    │   ├── page.tsx             # App entry point
    │   │                        # Renders Sidebar + Chat components
    │   │
    │   ├── favicon.ico          # Tab icon
    │   ├── fonts/               # Font files (Geist)
    │   └── globals.css          # Global styles
    │                            # - Tailwind directives (@tailwind base/components/utilities)
    │
    ├── components/
    │   ├── chat/
    │   │   ├── Chat.tsx               # Main chat container (sidebar + chat area)
    │   │   ├── MessageList.tsx        # Scrollable message list container
    │   │   ├── MessageBubble.tsx      # Single message bubble (user/assistant)
    │   │   ├── MessageInput.tsx       # User input form with submit button
    │   │   ├── StreamingRenderer.tsx  # Renders SSE events in real-time
    │   │   │                            # - Shows reasoning (collapsed/italic)
    │   │   │                            # - Shows tool calls (expandable)
    │   │   │                            # - Shows tool results
    │   │   │                            # - Shows answer (markdown rendered)
    │   │   │
    │   │   └── MarkdownSection.tsx      # Markdown content renderer wrapper
    │   │
    │   └── sidebar/
    │       ├── Sidebar.tsx            # Left sidebar panel
    │       ├── ThreadItem.tsx         # Individual thread item in sidebar
    │       └── NewThreadButton.tsx    # Button to create new thread
    │
    ├── context/
    │   └── ThreadContext.tsx          # Thread state management (React Context)
    │                                    # - Provides threads list
    │                                    # - Provides current thread
    │                                    # - Provides add/update/remove thread operations
    │
    ├── hooks/
    │   └── useSSEStream.ts            # SSE stream consumption hook
    │                                    # - start(message, thread_id): initiates SSE connection
    │                                    # - stop(): aborts active stream
    │                                    # - isStreaming: boolean state
    │                                    # - onEvent: callback for each SSE event
    │                                    # - onError: callback for errors
    │                                    # - onComplete: callback when done
    │
    └── types/
        └── index.ts                   # TypeScript type definitions
                                     # - ChatRequest, ToolCall, ThreadMessage, Thread
                                     # - SSEEventType (agent|reasoning|answer|tool_call|tool_result|error|done)
                                     # - SSEEvent
```

## Component Architecture

```
Page (app/page.tsx)
├── Sidebar
│   ├── NewThreadButton
│   └── ThreadItem (xN)
│
└── Chat
    ├── MessageList
    │   └── MessageBubble (xN)
    │       ├── StreamingRenderer (when streaming)
    │       │   ├── reasoning tokens (collapsed)
    │       │   ├── tool_call (expandable)
    │       │   ├── tool_result
    │       │   └── answer (markdown)
    │       └── MarkdownSection (for static content)
    │
    └── MessageInput
```

## SSE Integration

### The `useSSEStream` Hook

The core of the streaming logic lives in `src/hooks/useSSEStream.ts`. It handles:

1. **SSE connection** — `fetch()` to `POST /chat` with `AbortController` for cleanup
2. **SSE parsing** — splits raw text on `\n\n` boundaries, extracts `event:` and `data:` lines
3. **Event dispatch** — calls `onEvent(event)` callback for each parsed SSE event
4. **Lifecycle callbacks**:
   - `onEvent(event)` — called for every SSE event
   - `onError(error)` — called on connection errors
   - `onComplete()` — called when `done` event is received

### Usage in components

```tsx
import { useSSEStream } from "@/hooks/useSSEStream";
import { useCallback } from "react";

function Chat() {
  const handleEvent = useCallback((event: SSEEvent) => {
    switch (event.event) {
      case "reasoning":
        // Render reasoning tokens (collapsed/italic)
        break;
      case "tool_call":
        // Render tool call (expandable panel)
        break;
      case "tool_result":
        // Render tool result
        break;
      case "answer":
        // Append to answer content
        break;
      case "done":
        // Stream complete, update message status
        break;
      case "error":
        // Show error state
        break;
    }
  }, []);

  const { isStreaming, start, stop } = useSSEStream({
    onEvent: handleEvent,
    onError: (error) => console.error(error),
    onComplete: () => console.log("stream complete"),
  });

  const handleSend = (message: string) => {
    start({ message, thread_id: currentThread.id });
  };

  return (
    <MessageInput onSubmit={handleSend} disabled={isStreaming} />
  );
}
```

### SSE Event Types

The frontend handles these event types from the backend:

| Event | How it's displayed |
|---|---|
| `agent` | Shows which agent is currently active |
| `reasoning` | Rendered as collapsed/italic text (different from answer) |
| `tool_call` | Rendered as expandable tool invocation block |
| `tool_result` | Rendered as tool response block |
| `answer` | Rendered as markdown content (standard chat bubble) |
| `error` | Rendered as error message in the chat bubble |
| `done` | Updates message status to "done", enables input |

## Styling

- **Tailwind CSS** — all styling uses Tailwind utility classes
- **Inter font** — loaded via `next/font/google`
- **Dark mode** — `html.dark` class on root layout
- **No custom CSS files** — only `globals.css` with Tailwind directives

## Scripts

```bash
npm run dev       # Start dev server (localhost:3000)
npm run build     # Production build
npm run start     # Start production server
npm run lint      # Run ESLint

### Docker

```bash
# Build and start in detached mode
docker compose up --build -d

# View logs
docker compose logs -f frontend

# Stop
docker compose down
```

The frontend Docker image uses a multi-stage build: installs dependencies, builds the Next.js app with standalone output, and ships only the production artifacts (~150MB).

## Key Files to Know

| File | Responsibility |
|---|---|
| `src/app/page.tsx` | App entry point, renders layout |
| `src/app/layout.tsx` | Root layout, ThreadProvider, Inter font |
| `src/app/globals.css` | Tailwind CSS directives |
| `src/components/chat/Chat.tsx` | Main chat container |
| `src/components/chat/MessageBubble.tsx` | Individual message display |
| `src/components/chat/StreamingRenderer.tsx` | SSE event rendering logic |
| `src/components/chat/MessageInput.tsx` | User input form |
| `src/components/sidebar/Sidebar.tsx` | Conversation sidebar |
| `src/context/ThreadContext.tsx` | Thread state (React Context API) |
| `src/hooks/useSSEStream.ts` | SSE consumption hook |
| `src/types/index.ts` | TypeScript type definitions |
