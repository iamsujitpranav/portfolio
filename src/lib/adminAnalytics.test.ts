import { describe, it, expect } from "vitest";
import {
  allDisplays,
  allGames,
  allSecrets,
  allStops,
  canonicalId,
  displayLabel,
  formatSeconds,
  gameLabel,
  secretLabel,
  share,
  stopLabel,
} from "./adminAnalytics";
import { STOPS } from "./journey/sections";
import { PROJECT_SITES } from "./journey/projects";
import { SECRETS } from "./journey/secrets";
import { TRACKED_GAMES } from "./journey/passport";

describe("id → name", () => {
  it("names every résumé stop the trail has", () => {
    for (const stop of STOPS) expect(stopLabel(stop.id)).toBe(stop.label);
  });

  it("names every landmark board the world has", () => {
    for (const site of PROJECT_SITES) expect(displayLabel(site.id)).toBe(site.title);
  });

  it("names a stop's own board too — display_open fires for both kinds", () => {
    expect(displayLabel("skills")).toBe("Skills");
  });

  it("names every game the passport tracks", () => {
    // A game added to the passport must appear on the dashboard by that act
    // alone — never as a raw id like "snowmen" beside five real names.
    for (const game of TRACKED_GAMES) expect(gameLabel(game.id)).toBe(game.label);
  });

  it("names every secret without the marker glyph", () => {
    for (const secret of SECRETS) {
      expect(secretLabel(secret.id)).toBe(secret.fact.replace(/^✦\s*/, ""));
      expect(secretLabel(secret.id).startsWith("✦")).toBe(false);
    }
  });

  it("names a landmark opened by its PANEL id", () => {
    // display_open carries the panel id, prefix and all — the label lookup and
    // the ranking both have to see through it.
    expect(canonicalId("project:foundry")).toBe("foundry");
    expect(displayLabel("project:foundry")).toBe("The Foundry");
    expect(stopLabel("project:foundry")).toBe("The Foundry");
  });

  it("leaves an unprefixed id exactly as it is", () => {
    expect(canonicalId("skills")).toBe("skills");
    expect(canonicalId("")).toBe("");
  });

  it("falls back to the raw id for something the world no longer has", () => {
    // An event from a landmark that has since been renamed or removed is still
    // a fact about what a visitor did — it must not vanish from the dashboard.
    expect(stopLabel("demolished")).toBe("demolished");
    expect(displayLabel("demolished")).toBe("demolished");
    expect(gameLabel("pinball")).toBe("pinball");
    expect(secretLabel("nope")).toBe("nope");
  });
});

describe("the universe each panel ranks against", () => {
  it("offers every stop, landmark, game and secret", () => {
    expect(allStops()).toHaveLength(STOPS.length);
    expect(allDisplays()).toHaveLength(PROJECT_SITES.length + STOPS.length);
    expect(allGames()).toHaveLength(TRACKED_GAMES.length);
    expect(allSecrets()).toHaveLength(SECRETS.length);
  });

  it("gives every entry a label that isn't its id", () => {
    for (const item of [...allStops(), ...allDisplays(), ...allGames()]) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.label).not.toBe(item.id);
    }
  });
});

describe("formatting", () => {
  it("reads durations in minutes and seconds", () => {
    expect(formatSeconds(0)).toBe("—");
    expect(formatSeconds(-4)).toBe("—");
    expect(formatSeconds(9)).toBe("9s");
    expect(formatSeconds(60)).toBe("1m");
    expect(formatSeconds(252)).toBe("4m 12s");
  });

  it("takes a share to one decimal, and never divides by zero", () => {
    expect(share(1, 3)).toBe(33.3);
    expect(share(5, 5)).toBe(100);
    expect(share(0, 0)).toBe(0);
    expect(share(3, 0)).toBe(0);
  });
});
