import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  passport,
  loadPassport,
  markSecret,
  markStop,
  markLandmark,
  markGame,
  markTourComplete,
  markAsked,
  addMetres,
  resetPassport,
  passportSummary,
  flushPassport,
} from "./passport";
import { STOPS } from "./sections";
import { PROJECT_SITES } from "./projects";
import { SECRETS } from "./secrets";

const KEY = "sujit.journey.passport.v1";

/** Put the module back to "never loaded in this tab", the way a fresh page is. */
function rewind() {
  resetPassport(); // fresh in-memory record
  passport.data.visits = 0; // …and un-count the visit resetPassport books
  passport.data.firstSeen = 0;
  passport.ready = false;
  passport.returning = false;
  passport.rev = 0;
  localStorage.clear();
}

describe("passport persistence", () => {
  beforeEach(rewind);

  it("starts empty and counts the first visit", () => {
    const d = loadPassport();
    expect(d.visits).toBe(1);
    expect(d.secrets).toEqual([]);
    expect(passport.returning).toBe(false);
    expect(d.firstSeen).toBeGreaterThan(0);
  });

  it("survives a reload — the whole point of the module", () => {
    loadPassport();
    markSecret("stack");
    markStop("skills");
    markGame("tictactoe", "won");
    addMetres(120.5);
    flushPassport(); // writes are debounced; a reload in 3 ms isn't a real one

    // A new page load: same storage, module state reset.
    passport.ready = false;
    passport.returning = false;
    const d = loadPassport();

    expect(d.secrets).toEqual(["stack"]);
    expect(d.stops).toEqual(["skills"]);
    expect(d.games.tictactoe).toBe("won");
    expect(d.metres).toBeCloseTo(120.5);
    expect(d.visits).toBe(2);
    expect(passport.returning).toBe(true);
  });

  it("stamps are idempotent, and only the first one reports as new", () => {
    loadPassport();
    expect(markSecret("open")).toBe(true);
    expect(markSecret("open")).toBe(false);
    expect(passport.data.secrets).toEqual(["open"]);
  });

  it("stamps a landmark opened by its PANEL id", () => {
    // openDisplay passes the DisplayFocus id straight through, and a landmark
    // board's is the prefixed panel id. Refusing it meant the Landmarks section
    // of the passport could never fill in, however many boards you read.
    loadPassport();
    expect(markLandmark("project:foundry")).toBe(true);
    expect(passport.data.landmarks).toEqual(["foundry"]);
    // …and the same board, by either name, is still one stamp.
    expect(markLandmark("foundry")).toBe(false);
  });

  it("refuses ids that aren't real stops or landmarks", () => {
    loadPassport();
    expect(markStop("not-a-stop")).toBe(false);
    expect(markLandmark("not-a-landmark")).toBe(false);
    expect(passport.data.stops).toEqual([]);
    expect(passport.data.landmarks).toEqual([]);
  });

  it("a win is never downgraded by a later loss", () => {
    loadPassport();
    markGame("tictactoe", "won");
    expect(markGame("tictactoe", "played")).toBe(false);
    expect(passport.data.games.tictactoe).toBe("won");
    // …but a played game can still be won.
    markGame("match", "played");
    expect(markGame("match", "won")).toBe(true);
    expect(passport.data.games.match).toBe("won");
  });

  it("ignores nonsense distances rather than poisoning the total", () => {
    loadPassport();
    addMetres(10);
    addMetres(-5);
    addMetres(Number.NaN);
    addMetres(Number.POSITIVE_INFINITY);
    expect(passport.data.metres).toBe(10);
  });

  it("degrades to a fresh passport when the store is corrupt", () => {
    localStorage.setItem(KEY, "{not json");
    const d = loadPassport();
    expect(d.secrets).toEqual([]);
    expect(d.visits).toBe(1);
  });

  it("keeps the good fields when only one is malformed", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, visits: 3, secrets: "nope", stops: ["skills"], metres: 42 }),
    );
    const d = loadPassport();
    expect(d.secrets).toEqual([]); // the broken field alone falls back
    expect(d.stops).toEqual(["skills"]);
    expect(d.metres).toBe(42);
    expect(d.visits).toBe(4);
  });

  it("never throws when storage is unavailable", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("private mode");
      });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => loadPassport()).not.toThrow();
    expect(() => markSecret("years")).not.toThrow();
    // In-memory progress still works for the session.
    expect(passport.data.secrets).toEqual(["years"]);
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("a second tab's flush cannot erase this tab's progress", () => {
    // This tab loads, finds a secret, and hasn't flushed yet.
    loadPassport();
    markSecret("years");
    markStop("skills");

    // Meanwhile another tab (loaded earlier, from an emptier record) closes and
    // writes ITS view of the world over the top.
    localStorage.setItem(
      KEY,
      JSON.stringify({
        v: 1,
        visits: 1,
        secrets: ["stack"],
        stops: ["experience"],
        landmarks: ["foundry"],
        games: { curling: "won" },
        metres: 900,
        asked: 2,
        tour: true,
      }),
    );

    // Now this tab flushes. Nothing either side earned may be lost.
    flushPassport();
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved.secrets.sort()).toEqual(["stack", "years"]);
    expect(saved.stops.sort()).toEqual(["experience", "skills"]);
    expect(saved.landmarks).toEqual(["foundry"]);
    expect(saved.games.curling).toBe("won");
    expect(saved.metres).toBe(900); // max, not sum — both counted from one base
    expect(saved.asked).toBe(2);
    expect(saved.tour).toBe(true);
  });

  it("a played game on disk never overwrites a win in memory", () => {
    loadPassport();
    markGame("tictactoe", "won");
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, visits: 1, games: { tictactoe: "played" } }),
    );
    flushPassport();
    expect(JSON.parse(localStorage.getItem(KEY)!).games.tictactoe).toBe("won");
  });

  it("resetting really resets — the merge must not hand the stamps back", () => {
    loadPassport();
    markSecret("years");
    markStop("skills");
    flushPassport();
    resetPassport();
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved.secrets).toEqual([]);
    expect(saved.stops).toEqual([]);
  });

  it("resetting wipes the record and the store", () => {
    loadPassport();
    markSecret("years");
    markStop("skills");
    resetPassport();
    expect(passport.data.secrets).toEqual([]);
    expect(passport.data.stops).toEqual([]);
    expect(passportSummary().done).toBe(0);
  });
});

describe("passport completion", () => {
  beforeEach(rewind);

  it("counts every stamp in the world exactly once", () => {
    loadPassport();
    const s = passportSummary();
    // stops + landmarks + secrets + 5 games + 2 extras
    expect(s.total).toBe(STOPS.length + PROJECT_SITES.length + SECRETS.length + 5 + 2);
    expect(s.done).toBe(0);
    expect(s.pct).toBe(0);
    expect(s.complete).toBe(false);
  });

  it("moves as things are found", () => {
    loadPassport();
    markStop("skills");
    markSecret("stack");
    markTourComplete();
    markAsked();
    const s = passportSummary();
    expect(s.done).toBe(4);
    expect(s.pct).toBe(Math.round((4 / s.total) * 100));
    expect(s.sections.find((x) => x.id === "extras")?.done).toBe(2);
  });

  it("only a WON game earns the stamp", () => {
    loadPassport();
    markGame("curling", "played");
    expect(passportSummary().sections.find((s) => s.id === "games")?.done).toBe(0);
    markGame("curling", "won");
    expect(passportSummary().sections.find((s) => s.id === "games")?.done).toBe(1);
  });

  it("does not spoil an unfound secret's fact", () => {
    loadPassport();
    const before = passportSummary().sections.find((s) => s.id === "secrets")!;
    expect(before.items.every((i) => /^Secret \d+$/.test(i.label))).toBe(true);

    markSecret(SECRETS[0].id);
    const after = passportSummary().sections.find((s) => s.id === "secrets")!;
    expect(after.items[0].label).toBe(SECRETS[0].fact.replace(/^✦\s*/, ""));
  });

  it("reports complete once everything is stamped", () => {
    loadPassport();
    STOPS.forEach((s) => markStop(s.id));
    PROJECT_SITES.forEach((p) => markLandmark(p.id));
    SECRETS.forEach((s) => markSecret(s.id));
    ["tictactoe", "match", "curling", "obstacles", "snowmen"].forEach((g) => markGame(g, "won"));
    markTourComplete();
    markAsked();
    const s = passportSummary();
    expect(s.complete).toBe(true);
    expect(s.pct).toBe(100);
  });
});
