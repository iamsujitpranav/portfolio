"use client";

import { useRef, useState } from "react";
import { profile } from "@content/resume";

// THE ASSISTANT, IN THE WORLD.
//
// Same backend as the classic site's chat (POST /api/chat → FastAPI → Claude,
// grounded by pgvector RAG over the résumé). In 3D it is rendered directly on
// the physical terminal screen, so the visitor stays at the console and reads
// the streaming answer in the same place they typed the question.

type Msg = { role: "user" | "assistant"; content: string };

// Mirrors CHAT_MAX_MESSAGE_CHARS on the FastAPI side — a longer message is
// rejected there with a 422, so trim before sending rather than after.
const MAX_CHARS = 2000;

// Optional starter questions for the larger panel variant; the compact terminal
// screen hides them to preserve room for the transcript.
const SUGGESTIONS = [
  "How did he modernize the monolith?",
  "Show me the AI and RAG work",
  "What's his strongest stack?",
  "Is he open to remote roles?",
];

const SEED: Msg[] = [
  {
    role: "assistant",
    content: `I’m ${profile.name}’s résumé — ask me anything about the experience, projects, skills, or availability.`,
  },
];

export default function AskPanel({
  variant = "panel",
  autoEngage = false,
}: {
  variant?: "panel" | "terminal";
  autoEngage?: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>(SEED);
  const [engaged, setEngaged] = useState(variant !== "terminal" || autoEngage);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const scrollDown = () => {
    requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    });
  };

  const replaceLast = (content: string) =>
    setMessages((cur) => [...cur.slice(0, -1), { role: "assistant", content }]);

  async function send(text: string) {
    const q = text.trim().slice(0, MAX_CHARS);
    if (!q || busy) return;
    setInput("");
    setBusy(true);

    // The seeded greeting is local UI copy; only visitor/model turns after it
    // are sent back as conversation history.
    const history = messages;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...next, { role: "assistant", content: "" }]);
    scrollDown();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...history.slice(1), { role: "user", content: q }].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      // The backend caps Claude spend per IP; say so plainly instead of falling
      // through to the generic "backend unreachable" copy.
      if (res.status === 429) {
        replaceLast(
          "That's a lot of questions at once — the chat is rate-limited to keep costs sane. " +
            `Give it a minute, or email ${profile.email} directly.`,
        );
        scrollDown();
        return;
      }
      if (!res.ok || !res.body) throw new Error(`status ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        replaceLast(acc);
        scrollDown();
      }
    } catch {
      // The terminal remains usable as a clear status surface even when the
      // answering backend is unavailable.
      replaceLast(
        "I can't reach the answering service right now — it needs the FastAPI backend up with an " +
          `ANTHROPIC_API_KEY set. Every stop on this trail is still there to visit, and ${profile.email} always works.`,
      );
    } finally {
      setBusy(false);
      scrollDown();
    }
  }

  if (variant === "terminal" && !engaged) {
    return (
      <button
        type="button"
        className="jrnTerminalIdle"
        onClick={() => setEngaged(true)}
        aria-label="Open résumé assistant"
      >
        <span>RÉSUMÉ TERMINAL</span>
        <b>ASK MY RÉSUMÉ ANYTHING</b>
        <em>CLICK SCREEN TO START</em>
      </button>
    );
  }

  return (
    <div className={variant === "terminal" ? "jrnTerminalUi" : undefined}>
      <div className="jrnEyebrow">The Terminal · Ask me</div>
      <h2 className="jrnH">Ask my résumé anything</h2>
      <p className="jrnLead">
        Claude, grounded by retrieval over this exact résumé. Ask about the work,
        projects, stack, background, or availability.
      </p>

      <div className="jrnChat" ref={bodyRef} data-lenis-prevent>
        {messages.map((m, i) => (
          <div
            key={i}
            className={"jrnChatMsg " + m.role}
            data-text-static={i > 0 ? "true" : undefined}
          >
            <div
              className={
                busy && i === messages.length - 1 && m.role === "assistant" && !m.content
                  ? "jrnChatBubble jrnChatWait"
                  : "jrnChatBubble"
              }
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>

      <div className="jrnChatSuggest">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>

      <form
        className="jrnChatForm"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          type="text"
          autoFocus={variant === "terminal"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the AI work, the Rails years, availability…"
          aria-label="Ask my résumé"
          maxLength={MAX_CHARS}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? "…" : "Ask ↵"}
        </button>
      </form>
    </div>
  );
}
