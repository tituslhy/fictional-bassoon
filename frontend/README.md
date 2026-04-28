# Frontend

Next.js chat application for the fictional-bassoon AI agent.

## Overview

This is a real-time chat interface that streams agent reasoning, tool calls, tool results, and final answers via Server-Sent Events (SSE). It includes user authentication, conversation management, and responsive UI.

The frontend consists of three main areas:
1. **Authentication** — Login/Signup forms.
2. **Sidebar** — List of conversation threads.
3. **Chat area** — Message list with streaming renderer and user input form.

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

## Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout, AuthProvider
│   │   ├── page.tsx             # Chat entry point
│   │   ├── login/               # Login page
│   │   └── signup/              # Signup page
│   ├── components/
│   │   ├── chat/                # Chat rendering components
│   │   └── sidebar/             # Navigation
│   ├── context/
│   │   ├── AuthContext.tsx      # Authentication state
│   │   └── ThreadContext.tsx    # Thread state management
│   ├── hooks/
│   │   └── useSSEStream.ts      # SSE consumption hook
│   └── types/
│       └── index.ts             # TS Interfaces
```

## SSE Integration

The core streaming logic lives in `src/hooks/useSSEStream.ts`. It initiates an SSE connection via `POST /chat` and dispatches events like `reasoning`, `tool_call`, `tool_result`, `answer`, and `done` to the UI components.

## Styling

- **Tailwind CSS** — all styling uses Tailwind utility classes.
- **Dark mode** — `html.dark` class on root layout.

## Scripts

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # Run ESLint
```
