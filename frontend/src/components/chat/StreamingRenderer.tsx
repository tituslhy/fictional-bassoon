"use client";

import { useState } from "react";
import MarkdownSection from "./MarkdownSection";
import type { ToolCall } from "@/types";
import { ChevronDown, ChevronRight, Code } from "lucide-react";

interface StreamingRendererProps {
  reasoning?: string;
  answer: string;
  toolCalls: ToolCall[];
  isStreaming: boolean;
}

export default function StreamingRenderer({
  reasoning,
  answer,
  toolCalls,
  isStreaming,
}: StreamingRendererProps) {
  return (
    <div className="space-y-3">
      {reasoning && <ReasoningBlock content={reasoning} />}
      {toolCalls.length > 0 && (
        <div className="space-y-2">
          {toolCalls.map((tc) => (
            <ToolCallBlock key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}
      {(answer || isStreaming) && <AnswerBlock content={answer} isStreaming={isStreaming} />}
    </div>
  );
}

function ReasoningBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-[#262626] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 bg-[#111] hover:bg-[#1a1a1a] transition-colors text-left"
      >
        <span className="text-xs text-[#6b7280] italic">
          {expanded ? "Hide reasoning" : "Show reasoning"}
        </span>
        <span className="ml-auto text-[#6b7280]">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
      </button>
      {expanded && (
        <div className="px-3 py-2 bg-[#0a0a0a] border-t border-[#262626]">
          <p className="text-sm text-[#6b7280] italic leading-relaxed whitespace-pre-wrap">{content}</p>
        </div>
      )}
    </div>
  );
}

function ToolCallBlock({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  // Safety: Ensure we don't try to render an object as a React child (fixes Error #31)
  const name = typeof toolCall.name === "string" ? toolCall.name : JSON.stringify(toolCall.name);
  const args = typeof toolCall.args === "string" ? toolCall.args : JSON.stringify(toolCall.args, null, 2);
  const result = typeof toolCall.result === "string" ? toolCall.result : JSON.stringify(toolCall.result, null, 2);

  return (
    <div className="rounded-lg border border-[#262626] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 bg-[#1a1a1a] hover:bg-[#222] transition-colors text-left"
      >
        <Code className="w-4 h-4 text-[#f59e0b]" />
        <span className="text-sm text-[#e5e5e5] font-medium">{name}</span>
        <span className="ml-auto text-[#6b7280]">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>
      {expanded && (
        <div className="bg-[#111] border-t border-[#262626]">
          <div className="px-4 py-2">
            <p className="text-xs text-[#6b7280] mb-1">Arguments</p>
            <pre className="text-xs text-[#9ca3af] font-mono whitespace-pre-wrap bg-[#0a0a0a] rounded border border-[#262626] px-3 py-2 max-h-40 overflow-auto">
              {args}
            </pre>
          </div>
          {result && (
            <div className="px-4 py-2 border-t border-[#262626]">
              <p className="text-xs text-[#6b7280] mb-1">Result</p>
              <pre className="text-xs text-[#e5e5e5] font-mono whitespace-pre-wrap bg-[#0a0a0a] rounded border border-[#262626] px-3 py-2 max-h-40 overflow-auto">
                {result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnswerBlock({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  return (
    <div className="min-w-0">
      <MarkdownSection content={content} />
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-[#3b82f6] animate-pulse rounded-sm" />
      )}
    </div>
  );
}
