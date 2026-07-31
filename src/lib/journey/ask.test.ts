import { describe, expect, it } from "vitest";
import { destinationFor, ASK_TERMINAL } from "./ask";
import { PROJECT_SITES } from "./projects";
import { STOPS } from "./sections";

// The topic router decides where the avatar walks when the assistant answers.
// Its failure modes are quiet — a wrong match sends someone across the map
// mid-sentence, and a trigger-happy threshold makes the avatar pace about on
// every reply — so the interesting cases are pinned here rather than eyeballed.

describe("destinationFor", () => {
  it("sends a monolith question to the Foundry", () => {
    // The question is phrased the way a VISITOR would ask it — "break up" is a
    // thing people say about monoliths — while the answer states what actually
    // happened. Routing has to work off the visitor's vocabulary, not the
    // résumé's.
    const d = destinationFor(
      "How did he break up the monolith?",
      "He led the backend modernization of a large e-commerce monolith at Emami Frankross.",
    );
    expect(d?.id).toBe("foundry");
  });

  it("sends the RAG / AI questions to the Reading Room", () => {
    const d = destinationFor(
      "Show me the AI and RAG work",
      "He built semantic matching over a vector index with Claude behind it.",
    );
    expect(d?.id).toBe("reading-room");
  });

  it("sends availability questions to the Summit", () => {
    const d = destinationFor(
      "Is he open to remote roles?",
      "Yes — he is available for remote work and open to relocation.",
    );
    expect(d?.stopId).toBe("contact");
  });

  it("falls back to the Skills stop for a stack question", () => {
    const d = destinationFor(
      "What's his strongest stack?",
      "Ruby on Rails and Python, with Postgres and AWS underneath.",
    );
    expect(d?.stopId).toBe("skills");
  });

  it("stays put on small talk", () => {
    expect(destinationFor("hello", "Hi there — ask me anything.")).toBeNull();
    expect(destinationFor("thanks!", "Any time.")).toBeNull();
  });

  it("stays put on a single weak signal, but moves when it's what was asked", () => {
    // One broad stop keyword buried in an answer isn't enough to march anyone
    // across the map…
    expect(destinationFor("Tell me something", "He worked hard on it.")).toBeNull();
    // …the same word in the QUESTION is the visitor's actual intent.
    expect(destinationFor("Where has he worked?", "")?.stopId).toBe("experience");
  });

  it("does not fire on words that merely CONTAIN a keyword", () => {
    // Each of these was a live false positive before the keys grew leading
    // spaces, and each is phrased as a QUESTION on purpose: that's the ×2
    // weighting, so a single bad match clears the threshold on its own and the
    // assertion genuinely discriminates instead of hiding under it.
    expect(destinationFor("What's his average deal size?", "")).toBeNull(); // ave·rag·e
    expect(destinationFor("What research does he publish?", "")).toBeNull(); // re·search
    expect(destinationFor("Has he shipped on android?", "")).toBeNull(); // and·roi·d
    expect(destinationFor("Who settled that dispute?", "")).toBeNull(); // sett·led
    expect(destinationFor("What about guardrails?", "")).toBeNull(); // guard·rails
    expect(destinationFor("Tell me about the architecture", "")).toBeNull(); // the arc·hitecture

    // …and the real words still land.
    expect(destinationFor("Tell me about his search work", "")?.id).toBe("watchtower");
    expect(destinationFor("Does he know RAG?", "")?.id).toBe("reading-room");
    expect(destinationFor("Is he strong in Rails?", "")?.stopId).toBe("skills");
  });

  it("matches through punctuation and line breaks", () => {
    // Answers stream back as prose with newlines and brackets in them; a key
    // written with a leading space still has to land.
    expect(destinationFor("", "He rebuilt it on\nElasticSearch (with Kibana).")?.id).toBe("watchtower");
    expect(destinationFor("", "Stack: Rails, Python — plus AWS.")?.stopId).toBe("skills");
  });

  it("does not mistake model bias for the Collective Bias job", () => {
    // "Inmar Intelligence - Collective Bias" must not turn every answer that
    // mentions bias into a walk to the Forecast Mill.
    const d = destinationFor(
      "Does he think about fairness?",
      "He is careful about bias and fairness when evaluating model output.",
    );
    expect(d?.id).not.toBe("mill");
  });

  it("still routes when the backend gave nothing back", () => {
    // The chat degrades to an error message when FastAPI is down — the walk is
    // routed off the question alone so the trick still works without a key.
    const d = destinationFor("Tell me about the ElasticSearch work", "");
    expect(d?.id).toBe("watchtower");
  });

  it("always returns a destination something can actually route to", () => {
    const asked = [
      "How did he break up the monolith?",
      "What did he do at LotVue?",
      "Tell me about observability",
      "Is he available?",
      "What's his stack?",
      "Who is he?",
    ];
    for (const q of asked) {
      const d = destinationFor(q, "");
      if (!d) continue;
      // Exactly one of the two addressing modes, and it has to be a real place.
      expect(Boolean(d.stopId) !== Boolean(d.anchor)).toBe(true);
      if (d.stopId) expect(STOPS.some((s) => s.id === d.stopId)).toBe(true);
      if (d.anchor) expect(PROJECT_SITES.some((p) => p.id === d.id)).toBe(true);
      expect(d.label.length).toBeGreaterThan(0);
    }
  });
});

describe("ASK_TERMINAL", () => {
  it("faces the road it stands beside", () => {
    // The yaw is derived from the front vector, and Landmarks-style structures
    // are built with local +Z as their front — so this pairing is what keeps
    // the console pointed at visitors instead of at the trees.
    expect(Math.hypot(ASK_TERMINAL.fx, ASK_TERMINAL.fz)).toBeCloseTo(1, 2);
    expect(ASK_TERMINAL.yaw).toBeCloseTo(Math.atan2(ASK_TERMINAL.fx, ASK_TERMINAL.fz), 6);
  });

  it("is anchored to a point the router can deliver someone to", () => {
    expect(ASK_TERMINAL.anchor.edgeId).toBeTruthy();
    expect(ASK_TERMINAL.anchor.tAB).toBeGreaterThanOrEqual(0);
    expect(ASK_TERMINAL.anchor.tAB).toBeLessThanOrEqual(1);
  });
});
