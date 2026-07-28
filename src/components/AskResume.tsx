"use client";

import { useRef, useState } from "react";
import Reveal from "./Reveal";
import { profile } from "@content/resume";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Is he open to remote roles?",
  "Show his AWS & Kubernetes depth",
  "Rails vs. Python — which is stronger?",
  "Summarize the last 3 roles",
];

// Mirrors CHAT_MAX_MESSAGE_CHARS on the FastAPI side — a longer message is
// rejected there with a 422, so trim before sending rather than after.
const MAX_CHARS = 2000;

const SEED: Msg[] = [
  {
    role: "assistant",
    content: `Hi — I'm ${profile.name}'s résumé, answerable. Ask about experience, stack, or availability.`,
  },
];

export default function AskResume() {
  const [messages, setMessages] = useState<Msg[]>(SEED);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const scrollDown = () => {
    requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    });
  };

  /** Overwrite the trailing (streaming) assistant bubble. */
  const replaceLast = (content: string) =>
    setMessages((cur) => [...cur.slice(0, -1), { role: "assistant", content }]);

  async function send(text: string) {
    const q = text.trim().slice(0, MAX_CHARS);
    if (!q || busy) return;
    setInput("");
    setBusy(true);

    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...next, { role: "assistant", content: "" }]);
    scrollDown();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send only the conversational turns (drop the seed greeting).
        body: JSON.stringify({
          messages: next.filter((_, i) => i !== 0).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      // The backend caps Claude spend per IP; say so plainly instead of
      // falling through to the generic "backend unreachable" copy.
      if (res.status === 429) {
        replaceLast(
          "That's a lot of questions in a short window — the chat is rate-limited to keep costs sane. " +
            `Give it a minute, or email ${profile.email} and I'll answer directly.`,
        );
        scrollDown();
        return;
      }

      if (!res.ok || !res.body) {
        throw new Error(`status ${res.status}`);
      }

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
      replaceLast(
        "The chat service isn't reachable right now. Once the FastAPI backend is running with an ANTHROPIC_API_KEY set, answers stream in live. Meanwhile — reach me at " +
          profile.email +
          ".",
      );
    } finally {
      setBusy(false);
      scrollDown();
    }
  }

  return (
    <section id="ask">
      <div className="wrap">
        <Reveal>
          <div className="eyebrow">04 · ask my résumé</div>
        </Reveal>

        <div className="chatgrid">
          <div className="askside">
            <Reveal className="sectionhead">
              <h2>
                Don&apos;t read it — <span className="accentword">interrogate</span> it.
              </h2>
              <p className="sub">
                A <b style={{ color: "var(--text)" }}>Claude-powered chat with RAG over my résumé</b>, served
                by a <b style={{ color: "var(--text)" }}>FastAPI (Python)</b> backend. It answers from
                grounded context — a live demo of the exact stack below.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="suggest">
                {SUGGESTIONS.map((s) => (
                  <span key={s} onClick={() => send(s)} data-cursor>
                    {s}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.08} variant="scale">
            <div className="chatwrap">
              <div className="chathead">
                <span className="dots">
                  <i />
                  <i />
                  <i />
                </span>
                ask-my-resume · FastAPI + Claude
                <span className="powered">
                  <span className="livedot" /> RAG
                </span>
              </div>
              <div className="chatbody" ref={bodyRef}>
                {messages.map((m, i) => (
                  <div className={`msg ${m.role}`} key={i}>
                    <div className="av">{m.role === "user" ? "Y" : "S"}</div>
                    <div
                      className={`bubble ${
                        busy && i === messages.length - 1 && m.role === "assistant" && !m.content
                          ? "blinkcursor"
                          : ""
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
              <form
                className="chatinput"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about experience, stack, availability…"
                  aria-label="Ask a question"
                  maxLength={MAX_CHARS}
                  disabled={busy}
                />
                <button type="submit" disabled={busy || !input.trim()} data-cursor>
                  {busy ? "…" : "Send ↵"}
                </button>
              </form>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
