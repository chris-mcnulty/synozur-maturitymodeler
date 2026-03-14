import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { X, Send, Ticket, Bot, User } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface HelpChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function HelpChatPanel({ open, onClose }: HelpChatPanelProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! I'm the Orion Help Assistant. How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open) {
      abortControllerRef.current?.abort();
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!open || !user) return null;

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/support/help/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: messages.slice(-6),
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Chat failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                assistantContent += parsed.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                  return updated;
                });
              }
            } catch {}
          }
        }
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't process your request. Please try again." }]);
      }
    }

    abortControllerRef.current = null;
    setIsStreaming(false);
  };

  const handleEscalate = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const description = lastUserMsg ? `[From Help Chat] ${lastUserMsg.content}` : "";
    onClose();
    setLocation(`/support?description=${encodeURIComponent(description)}`);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-96 z-50 flex flex-col bg-background border-l shadow-xl" data-testid="panel-help-chat">
      <div className="flex items-center justify-between gap-2 p-4 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Help Assistant</h3>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-chat">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="p-1.5 rounded-full bg-primary/10 h-7 w-7 flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
            )}
            <Card className={`p-3 max-w-[80%] ${msg.role === "user" ? "bg-primary text-primary-foreground" : ""}`}>
              <p className="text-sm whitespace-pre-wrap" data-testid={`text-chat-message-${i}`}>{msg.content}</p>
            </Card>
            {msg.role === "user" && (
              <div className="p-1.5 rounded-full bg-muted h-7 w-7 flex items-center justify-center shrink-0">
                <User className="h-3.5 w-3.5" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t space-y-2">
        <Button variant="outline" size="sm" onClick={handleEscalate} className="w-full gap-2" data-testid="button-escalate-ticket">
          <Ticket className="h-4 w-4" /> Open Support Ticket
        </Button>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={isStreaming}
            data-testid="input-chat-message"
          />
          <Button size="icon" onClick={handleSend} disabled={!input.trim() || isStreaming} data-testid="button-send-chat">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
