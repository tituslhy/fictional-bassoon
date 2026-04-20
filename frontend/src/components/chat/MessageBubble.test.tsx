import { render, screen } from "@testing-library/react";
import MessageBubble from "./MessageBubble";
import { describe, it, expect } from "vitest";
import React from "react";
import type { ThreadMessage } from "@/types";

describe("MessageBubble", () => {
  it("should render user message", () => {
    const message: ThreadMessage = {
      id: "1",
      role: "user",
      content: "Hello from user",
      status: "done",
      toolCalls: [],
    };

    render(<MessageBubble message={message} isStreaming={false} />);
    expect(screen.getByText("Hello from user")).toBeInTheDocument();
  });

  it("should render error message", () => {
    const message: ThreadMessage = {
      id: "2",
      role: "assistant",
      content: "",
      status: "error",
      error: "Something went wrong",
      toolCalls: [],
    };

    render(<MessageBubble message={message} isStreaming={false} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("should render assistant reasoning and content", () => {
    const message: ThreadMessage = {
      id: "3",
      role: "assistant",
      content: "Hello from assistant",
      reasoning: "I am thinking about greeting you",
      status: "done",
      toolCalls: [],
    };

    render(<MessageBubble message={message} isStreaming={false} />);
    expect(screen.getByText("Hello from assistant")).toBeInTheDocument();
    // Reasoning is hidden by default in StreamingRenderer (collapsed)
    expect(screen.getByText("Show reasoning")).toBeInTheDocument();
  });
});
