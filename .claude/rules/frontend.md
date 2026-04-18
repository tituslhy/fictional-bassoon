# Frontend Standards

## Stack

- React + TypeScript
- Tailwind for styling
- No default exports
- Functional components only

## SSE consumption

- Connect to POST /chat
- Handle event types: reasoning, tool_call, tool_result, answer, error, done
- Show reasoning tokens differently from answer tokens (e.g. collapsed/italic)
