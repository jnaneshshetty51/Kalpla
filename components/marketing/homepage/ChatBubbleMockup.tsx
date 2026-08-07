export interface ChatBubbleMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatBubbleMockupProps {
  messages: ChatBubbleMessage[];
}

/**
 * Presentational-only mockup reusing the exact bubble classes from the real
 * tutor chat UI (app/(app)/learn/[skill]/page.tsx) so this looks like an
 * honest screenshot of the product, not an invented chat widget.
 */
export function ChatBubbleMockup({ messages }: ChatBubbleMockupProps) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`flex flex-col gap-1 max-w-[85%] ${msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"}`}
        >
          <div
            className={`rounded-2xl p-3.5 text-xs font-mono leading-relaxed ${
              msg.role === "user"
                ? "bg-telemetry-cyan font-bold text-observatory-base shadow-telemetry-cyan rounded-br-none"
                : "bg-observatory-base border border-steel-800 text-steel-200 rounded-bl-none shadow-inner"
            }`}
          >
            <span className="sr-only">{msg.role === "user" ? "You said: " : "AI Tutor said: "}</span>
            {msg.content}
          </div>
        </div>
      ))}
    </div>
  );
}
