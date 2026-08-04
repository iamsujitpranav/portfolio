"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { profile } from "@content/resume";
import { destinationFor, type AskDest } from "@/lib/journey/ask";
import { markAsked } from "@/lib/journey/passport";
import { track } from "@/lib/journey/analytics";

// THE ASSISTANT, IN THE WORLD.
//
// Same backend as the classic site's chat (POST /api/chat → FastAPI → Claude,
// grounded by pgvector RAG over the résumé). In 3D it is rendered directly on
// the physical terminal screen, so the visitor stays at the console and reads
// the streaming answer in the same place they typed the question.
//
// Two things make it more than a chat box:
//
//  1. IT WALKS YOU THERE. Every answer is run through `destinationFor` (a
//     keyword table, client-side, no extra tokens) and when it points somewhere
//     real the answer carries a button that takes the avatar to that landmark.
//     Reading "he rebuilt search on Elasticsearch" and then standing in front of
//     the Watchtower is the part people remember.
//  2. IT COMES TO YOU. `variant="dock"` is the same panel summoned with `/` from
//     anywhere on the trail, so the assistant is not a place you have to find.

type Msg = { role: "user" | "assistant"; content: string; dest?: AskDest | null };

// Mirrors CHAT_MAX_MESSAGE_CHARS on the FastAPI side — a longer message is
// rejected there with a 422, so trim before sending rather than after.
const MAX_CHARS = 2000;

// Starter questions. The terminal variant hides them to preserve room for the
// transcript; the dock and panel show them, with a context-specific one first
// whenever the visitor is standing next to something.
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

// --- speech ----------------------------------------------------------------
// Chrome/Edge/Safari expose this under two names and no types ship for it, so
// it's feature-detected and narrowly typed here rather than assumed.
type RecognitionEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechWindow = {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

function recognizer(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as SpeechWindow;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = "en-US";
  r.interimResults = false;
  r.continuous = false;
  return r;
}

// Support is a fact about the browser, not React state: decided once per page,
// read through useSyncExternalStore so the server renders "no mic" and the
// client corrects it without a cascading effect. `getSnapshot` must be cheap and
// stable, which is why the answer is memoised rather than re-probed per render.
let speechSupport: boolean | null = null;
function speechAvailable(): boolean {
  if (speechSupport === null) {
    if (typeof window === "undefined") return false;
    const w = window as unknown as SpeechWindow;
    speechSupport = !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
  }
  return speechSupport;
}
const noSubscribe = () => () => {};
const noSpeechOnServer = () => false;

export default function AskPanel({
  variant = "panel",
  autoEngage = false,
  onWalkTo,
  nearby = null,
}: {
  variant?: "panel" | "terminal" | "dock";
  autoEngage?: boolean;
  /** Send the avatar where an answer points. Omit and the button never shows. */
  onWalkTo?: (dest: AskDest) => void;
  /** What the visitor is standing next to, for a suggestion that fits. */
  nearby?: { id: string; title: string } | null;
}) {
  const [messages, setMessages] = useState<Msg[]>(SEED);
  const [engaged, setEngaged] = useState(variant !== "terminal" || autoEngage);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const recog = useRef<Recognition | null>(null);
  const canSpeak = useSyncExternalStore(noSubscribe, speechAvailable, noSpeechOnServer);

  // Leaving with the mic hot would keep listening after the panel is gone.
  useEffect(() => () => recog.current?.stop(), []);

  const scrollDown = () => {
    requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    });
  };

  const replaceLast = (content: string, dest?: AskDest | null) =>
    setMessages((cur) => [...cur.slice(0, -1), { role: "assistant", content, dest }]);

  const suggestions = useMemo(() => {
    if (!nearby) return SUGGESTIONS;
    // The thing they're standing in front of goes first — the question a visitor
    // most wants answered is about whatever is filling their screen.
    return [`What is ${nearby.title}?`, ...SUGGESTIONS].slice(0, 4);
  }, [nearby]);

  async function send(text: string) {
    const q = text.trim().slice(0, MAX_CHARS);
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    markAsked();
    // `q` is the question itself. The backend DROPS it unless ANALYTICS_QUESTIONS
    // is on there (main.py `_scrub`), so the switch is one env var and no
    // frontend deploy — and off, this is a length and nothing else.
    track("ask_question", { q, chars: q.length, variant, nearby: nearby?.id ?? null });

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
      // Route only on the FINISHED answer: a half-streamed sentence can match a
      // topic the completed one doesn't.
      const dest = destinationFor(q, acc);
      if (dest) {
        replaceLast(acc, dest);
        track("ask_routed", { to: dest.id });
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

  /** Dictate a question. One utterance, then it sends itself — a mic that makes
   *  you press "Ask" afterwards has saved nobody anything. */
  function toggleMic() {
    if (listening) {
      recog.current?.stop();
      return;
    }
    const r = recognizer();
    if (!r) return;
    recog.current = r;
    r.onresult = (e) => {
      const said = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (said) {
        setInput(said);
        void send(said);
      }
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    try {
      r.start();
      setListening(true);
      track("ask_voice");
    } catch {
      setListening(false); // already running, or permission denied
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
        projects, stack, background, or availability{onWalkTo ? " — and I'll walk you to it" : ""}.
      </p>

      <div className="jrnChat" ref={bodyRef} data-lenis-prevent>
        {messages.map((m, i) => (
          <div
            key={i}
            className={"jrnChatMsg " + m.role}
            data-text-static={i > 0 ? "true" : undefined}
          >
            <div className="jrnChatCol">
              <div
                className={
                  busy && i === messages.length - 1 && m.role === "assistant" && !m.content
                    ? "jrnChatBubble jrnChatWait"
                    : "jrnChatBubble"
                }
              >
                {m.content}
              </div>
              {/* The answer points at a real place in the world — offer the walk. */}
              {m.dest && onWalkTo && (
                <button
                  className="jrnChatGo"
                  onClick={() => {
                    track("ask_walkto", { to: m.dest!.id });
                    onWalkTo(m.dest!);
                  }}
                >
                  → Take me to {m.dest.label}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="jrnChatSuggest">
        {suggestions.map((s) => (
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
          autoFocus={variant !== "panel"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={listening ? "Listening…" : "Ask about the AI work, the Rails years, availability…"}
          aria-label="Ask my résumé"
          maxLength={MAX_CHARS}
          disabled={busy}
        />
        {canSpeak && (
          <button
            type="button"
            className="jrnChatMic"
            data-on={listening ? "1" : undefined}
            onClick={toggleMic}
            disabled={busy}
            aria-label={listening ? "Stop listening" : "Ask by voice"}
            title={listening ? "Stop listening" : "Ask by voice"}
          >
            {listening ? "◉" : "🎙"}
          </button>
        )}
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? "…" : "Ask ↵"}
        </button>
      </form>
    </div>
  );
}
