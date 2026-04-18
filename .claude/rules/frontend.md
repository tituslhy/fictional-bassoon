# Frontend Standards

## Stack

- Next.js App Router (not Pages Router)
- TypeScript strict mode
- Tailwind for styling only — no custom CSS files
- No creative component libraries unless explicitly requested
- Auth flow talks to crud_backend only
- Streaming display talks to agents_backend SSE endpoint
- Handle SSE event types: reasoning, tool_call, tool_result, answer, error, done

## SSE consumption

- Connect to POST /chat
- Handle event types: reasoning, tool_call, tool_result, answer, error, done
- Show reasoning tokens differently from answer tokens (e.g. collapsed/italic)
