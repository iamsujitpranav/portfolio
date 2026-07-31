"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import Scene from "./Scene";
import GameHud from "./GameHud";
import JourneyMap from "./JourneyMap";
import AskPanel from "./AskPanel";
import DisplayAtmosphere, { type DisplayVisualTheme } from "./DisplayAtmosphere";
import BoardContent from "./BoardContent";
import MatrixTextFormation from "./MatrixTextFormation";
import type { Nav } from "./Avatar";
import type { DisplayFocus } from "./CameraRig";
import { resetGame, setSprint, pushToast } from "@/lib/journey/game";
import { STOPS, STOP_SIGN_OFFSETS, JUNCTION_SIGN_OFFSETS, stopNodeId } from "@/lib/journey/sections";
import { ASK_TERMINAL } from "@/lib/journey/ask";
import {
  spawnAt,
  placeCursor,
  resetCursor,
  edgePointXZ,
  nodeById,
  START_ANCHOR,
} from "@/lib/journey/graph";
import {
  beginWarp,
  endWarp,
  roadAhead,
  WARP_FACE,
  WARP_LOOK_MIN,
  type WarpPose,
} from "@/lib/journey/warp";
import { TONEMAP_EXPOSURE } from "@/lib/journey/config";
import { panelProject, projectById } from "@/lib/journey/projects";
import {
  TOUR,
  TOUR_MINUTES,
  beatTitle,
  tour,
  resetTourCamera,
  type TourBeat,
} from "@/lib/journey/tour";
import { profile } from "@content/resume";
import { useReducedMotion } from "@/lib/useReducedMotion";

// Classic-site anchors each stop can hand off to.
const CLASSIC_HASH: Record<string, string> = {
  start: "",
  thesis: "thesis",
  experience: "work",
  skills: "skills",
  ask: "ask",
  contact: "contact",
};

type Phase = "idle" | "loading" | "building" | "ready";

/** Where the guided tour has got to: which beat, and whether the avatar is
 *  still walking to it or parked in front of its card. */
type TourAt = { beat: number; phase: "teleport" | "read" } | null;

/** Card queued for the current destination. */
type Pending = { panel: string };

/** A point on the graph, and the world XZ of the thing that click was about. */
type Anchor = { edgeId: string; tAB: number };
type Look = { x: number; z: number };

function tourPanelId(beat: TourBeat): string {
  void beat;
  return "";
}

function boardLook(id: string): Look | null {
  const node = nodeById(stopNodeId(id));
  const off = STOP_SIGN_OFFSETS[id] ?? JUNCTION_SIGN_OFFSETS[id];
  return node && off ? { x: node.x + off[0], z: node.z + off[1] } : null;
}

type DisplayTheme = DisplayVisualTheme;
type DisplayPresentation = { theme: DisplayTheme; kicker: string; title: string; glyph: string };

function displayPresentation(id: string): DisplayPresentation {
  const site = panelProject(id);
  if (site) return { theme: "project", kicker: "PROJECT LANDMARK · INDUSTRIAL EXHIBIT", title: site.title, glyph: "▰" };
  switch (id) {
    case "start":
      return { theme: "town", kicker: "THE ROOT · TRAILHEAD INTRODUCTION", title: "The person behind the trail", glyph: "◆" };
    case "thesis":
      return { theme: "projector", kicker: "THE ARC · PROJECTED MANIFESTO", title: "My career in one paragraph", glyph: "◒" };
    case "experience":
      return { theme: "career", kicker: "EXPERIENCE · CAREER CINEMA", title: "Where I have worked, and on what", glyph: "▶" };
    case "skills":
      return { theme: "blueprint", kicker: "SKILLS · BLUEPRINT WALL", title: "The stack I build with", glyph: "⌘" };
    case "contact":
      return { theme: "signal", kicker: "SUMMIT · SIGNAL DISPLAY", title: "Social Trail · connect with me", glyph: "⌁" };
    case "social":
      return { theme: "social", kicker: "TOWN SQUARE · SOCIAL DIRECTORY", title: "Find me online", glyph: "✦" };
    case "ask":
      return { theme: "terminal", kicker: "CAMERA LINKED · RÉSUMÉ TERMINAL", title: "Ask my résumé anything", glyph: ">_" };
    default:
      return { theme: "project", kicker: "TRAIL EXHIBIT", title: "Résumé detail", glyph: "◇" };
  }
}

export default function JourneyOverlay() {
  const reduce = useReducedMotion();
  // A single stable, mutable object shared with the canvas (avatar + camera).
  // useMemo (not a ref) keeps it out of render-time ref access. The cursor
  // starts parked at the journey's spawn node on the path graph.
  const nav = useMemo<Nav>(() => {
    const s = START_ANCHOR;
    return {
      route: [],
      step: 0,
      edgeId: s.edgeId,
      tAB: s.tAB,
      destTab: s.tAB,
      destNodeId: null,
      dir: 1,
      progress: 0,
      moving: false,
      revealed: false,
    };
  }, []);

  const [mounted, setMounted] = useState(false);
  const [capable, setCapable] = useState(false);
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeId, setActiveId] = useState("cross");
  const [panelId, setPanelId] = useState<string | null>(null);
  const [displayFocus, setDisplayFocus] = useState<DisplayFocus | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [walking, setWalking] = useState(false);
  const [openingShot, setOpeningShot] = useState(true);
  const [launch, setLaunch] = useState(0); // remount key to replay the journey
  const pending = useRef<Pending>({ panel: "" });
  // --- guided tour ---------------------------------------------------------
  const [tourAt, setTourAt] = useState<TourAt>(null);
  // Mirror of "a tour is running" for the stable onArrive callback, which is
  // handed to the canvas and must not change identity every beat.
  const touring = useRef(false);
  // The visitor asked for the tour from the title card, before the world had
  // finished loading — start it the moment it's walkable. The ref is what the
  // ready callback reads (it would close over stale state otherwise); the state
  // is only there to light the button up.
  const [tourQueued, setTourQueued] = useState(false);
  const wantTour = useRef(false);

  const { progress } = useProgress();

  // drei's in-world <Html> labels are portaled to <body> with a very high
  // z-index, outside this overlay's stacking context. Suppress every floating
  // board label while a full-screen résumé display or the introduction is open.
  useEffect(() => {
    document.documentElement.classList.toggle("jrn-display-open", !!displayFocus || showWelcome);
    return () => {
      document.documentElement.classList.remove("jrn-display-open");
    };
  }, [displayFocus, showWelcome]);

  // The opening is a clean portrait of the Architect board. Drei's <Html>
  // labels live above WebGL, so suppress every other floating world label until
  // the visitor walks, teleports, or takes control of the camera.
  useEffect(() => {
    document.documentElement.classList.toggle("jrn-opening-shot", openingShot);
    return () => {
      document.documentElement.classList.remove("jrn-opening-shot");
    };
  }, [openingShot]);

  // Decide capability once on the client. Immersive-by-default on capable
  // desktops; opt-in elsewhere so mobiles / reduced-motion users aren't forced
  // into a heavy WebGL scene.
  useEffect(() => {
    setMounted(true);
    let webgl = false;
    try {
      const c = document.createElement("canvas");
      webgl = !!(
        c.getContext("webgl2") || c.getContext("webgl")
      );
    } catch {
      webgl = false;
    }
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const small = window.innerWidth < 820;
    setCapable(webgl);
    if (webgl && !reduce && !coarse && !small) {
      resetGame();
      setActive(true);
      setPhase("loading");
    }
  }, [reduce]);

  // Reflect the avatar's walking state (drives button disabling / caption).
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      setWalking((w) => (w !== nav.moving ? nav.moving : w));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, nav]);

  /**
   * Stop the guided tour. Called both when it runs out of beats and by every
   * single thing a visitor can do to take the wheel back — a menu click, the
   * map, a landmark plaque, Esc. Nothing is left behind: the avatar simply
   * stands wherever the route got to.
   */
  const endTour = useCallback((finished = false) => {
    if (!touring.current) return;
    touring.current = false;
    tour.active = false;
    resetTourCamera();
    setSprint(false);
    setTourAt(null);
    setTourQueued(false);
    if (finished) pushToast("That's the tour — the trail's yours now.", "board");
  }, []);

  // A warp arrival in flight — the camera shot and the card it has queued (see
  // the trail-map teleport further down). Anything that takes the avatar
  // somewhere else stands both of them down first: a card timed to a shot that
  // is no longer running would land on top of whatever the visitor did next.
  const warpCard = useRef<number | null>(null);
  const stopWarp = useCallback(() => {
    if (warpCard.current) clearTimeout(warpCard.current);
    warpCard.current = null;
    endWarp();
  }, []);
  useEffect(() => () => stopWarp(), [stopWarp]);

  const openDisplay = useCallback((focus: DisplayFocus) => {
    endTour();
    stopWarp();
    nav.route = [];
    nav.moving = false;
    setShowWelcome(false);
    setPanelId(null);
    setDisplayFocus(focus);
  }, [endTour, nav, stopWarp]);

  const closeDisplay = useCallback(() => setDisplayFocus(null), []);

  const startJourney = useCallback(() => {
    endTour(); // a replay must not resume a tour the last run was halfway through
    stopWarp();
    resetGame();
    resetCursor(nav);
    nav.progress = 0;
    nav.moving = false;
    nav.revealed = false;
    setActiveId("cross"); // the spawn node — the Town Square at the five-way
    setPanelId(null);
    setDisplayFocus(null);
    setShowWelcome(false);
    setOpeningShot(true);
    pending.current = { panel: "" };
    setActive(true);
    setPhase("loading");
    setLaunch((n) => n + 1);
  }, [nav, endTour, stopWarp]);

  // --- TELEPORT ------------------------------------------------------------
  // Asking to be somewhere puts you there. Every surface that names a
  // destination — the Trail menu, the signposts, the map, the Games list, the
  // assistant — lands the avatar on the spot instead of walking it over; the
  // walk was never the answer to "take me to Experience", it was ninety seconds
  // between the question and the answer.
  //
  // The guided tour uses the same teleport path, sequencing the stops for the
  // visitor while manual walking remains available outside it.
  //
  // A character that simply blinks into existence reads as a rendering bug, so
  // arriving gets a shot of its own: the avatar materialises while the camera
  // holds one clear road-to-board bearing, then dollies closer. That
  // choreography lives in lib/journey/warp.ts; this just supplies its target.
  //
  // `panel` is what should be on screen when the shot lands: a stop id opens
  // that card, while "" clears the panel.
  const warpToPoint = useCallback(
    (
      edgeId: string,
      tAB: number,
      look: Look,
      panel: string,
      pose: WarpPose = "trail",
    ): boolean => {
      endTour(); // the visitor is steering now
      stopWarp(); // and any arrival still playing is last click's, not this one's
      if (!placeCursor(nav, edgeId, tAB)) return false;
      beginWarp(look.x, look.z, !reduce, pose, edgeId, tAB);
      // A teleport may interrupt a route; clear any stale arrival card before
      // queuing the new destination’s panel.
      pending.current = { panel: "" };
      setPanelId(null);
      if (!panel) return true;
      // The card lands WITH the camera's turn, not with the click: the first
      // beat of the shot belongs to the avatar appearing, and a panel sliding
      // over it would be the one thing you couldn't watch.
      if (reduce) setPanelId(panel);
      else warpCard.current = window.setTimeout(() => setPanelId(panel), WARP_FACE * 1000);
      return true;
    },
    [nav, endTour, stopWarp, reduce],
  );

  /** A résumé stop or junction selected from the Trail, a sign, or the map.
   *  The camera looks from the road toward that place’s physical board. Ask is
   *  the exception: it lands at and faces the terminal screen itself. */
  const warpTo = useCallback(
    (id: string) => {
      if (!nodeById(id)) return;
      setShowWelcome(false);
      if (id === "ask") {
        warpToPoint(
          ASK_TERMINAL.anchor.edgeId,
          ASK_TERMINAL.anchor.tAB,
          { x: ASK_TERMINAL.x, z: ASK_TERMINAL.z },
          "",
        );
        setActiveId("ask");
        return;
      }
      // The Architect is staged just off the south road, directly in front of
      // its wide board. Its graph cursor still belongs on that road so the next
      // walk can blend back cleanly, but the arrival body uses the same plaza
      // pose as the opening shot instead of disappearing at the Crossroads.
      const isArchitect = id === "start";
      const s = isArchitect ? START_ANCHOR : spawnAt(stopNodeId(id));
      warpToPoint(
        s.edgeId,
        s.tAB,
        boardLook(id) ?? roadAhead(s.edgeId, s.tAB),
        "",
        isArchitect ? "architect" : "trail",
      );
      setActiveId(id);
    },
    [warpToPoint],
  );

  const openSocialTrail = useCallback(() => {
    setShowWelcome(false);
    warpTo("contact");
  }, [warpTo]);

  /** A landmark, the library, a kiosk, a game: `look` is the thing itself, so
   *  the turn ends framed on it. Markers that sit ON the road (a snowball
   *  target, an obstacle) have nothing to frame — those fall back to the road. */
  const warpToAnchor = useCallback(
    (anchor: Anchor, look?: Look) => {
      const [ax, az] = edgePointXZ(anchor.edgeId, anchor.tAB);
      const far = look && Math.hypot(look.x - ax, look.z - az) > WARP_LOOK_MIN;
      warpToPoint(
        anchor.edgeId,
        anchor.tAB,
        far ? look! : roadAhead(anchor.edgeId, anchor.tAB),
        "", // you went there to look at the thing, not to read a card
      );
      setActiveId(""); // standing at a landmark, not at a résumé stop
    },
    [warpToPoint],
  );

  const onArrive = useCallback(() => {
    // Mid-tour: arriving is the cue to stop and read, not to open `pending`.
    if (touring.current) return;
    setPanelId(pending.current.panel || null);
  }, []);

  // Cancel a walk mid-stride — the visitor changed their mind about the
  // destination. Halt the avatar exactly where it stands on the path graph
  // WITHOUT arriving: clearing `pending` first means the arrival callback the
  // Avatar fires the frame the route empties opens no panel and the journey
  // doesn't advance. `moving` flips false on the next avatar frame, which the
  // rAF tick above mirrors into `walking` (re-enabling the menu).
  const cancelWalk = useCallback(() => {
    // Esc during a tour means "stop showing me around" even while parked at a
    // beat reading — so the tour ends first, whether or not a walk is running.
    endTour();
    // Same for a warp arrival: the camera stops where it is and the view is
    // theirs. The card it queued is left alone — Esc means "stop moving the
    // picture", not "undo the place I just clicked".
    endWarp();
    if (nav.route.length === 0) return; // not walking — nothing to cancel
    pending.current = { panel: "" };
    nav.route = [];
    nav.step = 0;
    nav.destTab = nav.tAB; // "destination" is now right here
    nav.destNodeId = null;
    setActiveId(""); // stopped between stops — nothing is the current one
    setPanelId(null);
  }, [nav, endTour]);

  // --- the guided tour sequencer -------------------------------------------
  // Two small pieces: teleport to a beat, drive the beat's card, and step to the
  // next one. The tour uses the same interruptible arrival choreography as the
  // Trail menu and map, so every stop gets a clear visual landing.

  /** Teleport the avatar to a beat and let the existing arrival shot introduce
   *  the place. The tour remains a sequence of stops, but never makes visitors
   *  wait through the long roads between them. */
  const routeToBeat = useCallback(
    (b: TourBeat): boolean => {
      pending.current = { panel: tourPanelId(b) };
      setPanelId(null);

      if (b.kind === "stop") {
        const target =
          b.id === "ask"
            ? ASK_TERMINAL.anchor
            : b.id === "start"
              ? START_ANCHOR
              : spawnAt(stopNodeId(b.id));
        if (!placeCursor(nav, target.edgeId, target.tAB)) return false;
        const look =
          b.id === "ask"
            ? { x: ASK_TERMINAL.x, z: ASK_TERMINAL.z }
            : boardLook(b.id) ?? roadAhead(target.edgeId, target.tAB);
        beginWarp(
          look.x,
          look.z,
          !reduce,
          b.id === "start" ? "architect" : "trail",
        );
        setActiveId(b.id);
        return true;
      }

      const site = projectById(b.id);
      if (!site) return false;
      if (!placeCursor(nav, site.anchor.edgeId, site.anchor.tAB)) return false;
      beginWarp(site.x, site.z, !reduce);
      setActiveId(""); // standing at a landmark, not at a résumé stop
      return true;
    },
    [nav, reduce],
  );

  const startTour = useCallback(() => {
    touring.current = true;
    tour.active = true;
    wantTour.current = false;
    resetTourCamera();
    setSprint(false); // The tour now hops between stops with the arrival effect
    setPanelId(null);
    setTourQueued(false);
    setTourAt({ beat: 0, phase: "teleport" });
  }, []);

  /** Move on: the next beat, or the end of the tour. */
  const advanceBeat = useCallback(
    (from: number) => {
      if (from + 1 >= TOUR.length) {
        endTour(true);
        return;
      }
      setTourAt({ beat: from + 1, phase: "teleport" });
    },
    [endTour],
  );

  // Beat → teleport: play the arrival shot before opening the card. In reduced
  // motion mode the card opens immediately after the avatar is placed.
  useEffect(() => {
    if (!tourAt || tourAt.phase !== "teleport") return;
    const b = TOUR[tourAt.beat];
    if (!b) return;
    resetTourCamera();
    if (!routeToBeat(b)) {
      setTourAt({ beat: tourAt.beat, phase: "read" });
      return;
    }
    const wait = reduce ? 0 : WARP_FACE * 1000;
    const t = window.setTimeout(
      () => setTourAt({ beat: tourAt.beat, phase: "read" }),
      wait,
    );
    return () => window.clearTimeout(t);
  }, [tourAt, routeToBeat, reduce]);

  // Beat → read: open the card, hand the camera its crane shot, and set the
  // timer that moves things along. Cleanup covers every way out — a cancelled
  // tour, a skipped beat, unmounting mid-shot.
  useEffect(() => {
    if (!tourAt || tourAt.phase !== "read") return;
    const b = TOUR[tourAt.beat];
    if (!b) return;
    setPanelId(tourPanelId(b) || null);
    tour.cinematic = true;
    const t = setTimeout(() => advanceBeat(tourAt.beat), b.dwell * 1000);
    return () => {
      clearTimeout(t);
      tour.cinematic = false;
    };
  }, [tourAt, advanceBeat]);

  // Esc is the keyboard twin of the on-screen Stop button. Bound only while the
  // HUD is live, and a no-op when not walking, so it never swallows Esc elsewhere.
  useEffect(() => {
    if (phase !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (displayFocus) closeDisplay();
        else if (showWelcome) setShowWelcome(false);
        else cancelWalk();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, displayFocus, showWelcome, closeDisplay, cancelWalk]);

  const onLoaded = useCallback(() => setPhase("building"), []);
  const onReady = useCallback(() => {
    setPhase("ready");
    // The opening portrait is only a loading composition. Once the avatar is
    // ready, release world-space labels so signposts, plaques, and kiosks
    // become visible and usable.
    setOpeningShot(false);
    // The avatar spawns on the Town Square (the Crossroads) — mark it current.
    setActiveId("cross");
    // Asked for the tour off the title card while the world was still loading?
    // Then the journey's first move is the tour, not the trailhead panel.
    if (wantTour.current) {
      wantTour.current = false;
      startTour();
      return;
    }
    setPanelId(null); // content waits for a physical board click
  }, [startTour]);

  const toClassic = useCallback((hash?: string) => {
    endTour(); // leaving the world ends the tour with it
    setDisplayFocus(null);
    setActive(false);
    setPhase("idle");
    if (hash) {
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
      }, 120);
    }
  }, [endTour]);

  const panel = panelId ? renderPanel(panelId) : null;
  const presentation = displayFocus ? displayPresentation(displayFocus.id) : null;
  const displayContent = displayFocus ? renderPanel(displayFocus.id) : null;

  if (!mounted) return null;

  // Inactive: show a launch pill on capable devices (classic site shows through).
  if (!active) {
    return capable ? (
      <button className="jrnLaunch" onClick={startJourney}>
        <span className="jrnLaunchDot" />
        Explore my résumé in 3D
      </button>
    ) : null;
  }

  return (
    <div className="jrnRoot" role="region" aria-label="3D résumé journey">
      <Canvas
        key={launch}
        className="jrnCanvas"
        // Explicit PCF type: the boolean `shadows` sets PCFSoftShadowMap, which
        // three r0.185 deprecated (it warns and falls back to PCFShadowMap anyway).
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: TONEMAP_EXPOSURE,
        }}
        camera={{ position: [0, 6, 16], fov: 55, near: 0.5, far: 600 }}
      >
        <Scene
          nav={nav}
          activeId={activeId}
          onPick={warpTo}
          onLoaded={onLoaded}
          onReady={onReady}
          onArrive={onArrive}
          avatarReady={phase === "ready"}
          openingShot={openingShot}
          onOpeningEnd={() => setOpeningShot(false)}
          displayFocus={displayFocus}
          onDisplay={openDisplay}
        />
      </Canvas>

      {/* Loading / assembling gate — and the title card. This is the FIRST thing
          anyone sees, and it used to be a bare progress bar, so the site opened
          with no idea whose it was. Now it's a nameplate: who, what, and what
          this strange snowy world is for. */}
      {phase !== "ready" && (
        <div className={`jrnGate ${phase === "building" ? "lifting" : ""}`}>
          <div className="jrnGateInner">
            <div className="jrnGateEyebrow">Interactive 3D résumé</div>
            <h1 className="jrnGateName">{profile.name}</h1>
            <p className="jrnGateRole">
              {profile.title} · {profile.yearsExperience}+ years · {profile.location}
            </p>
            <p className="jrnGateTag">
              Explore a winter trail through my career — every stop on the map is a
              piece of the résumé.
            </p>
            <div className="jrnRing">
              <span style={{ transform: `scaleX(${Math.max(0.04, progress / 100)})` }} />
            </div>
            <p className="jrnGateText">
              {phase === "building" ? "Assembling your guide…" : "Loading the trail…"}
            </p>

            {/* The single highest-value button on the site. Most people land
                here, admire the snow and leave without reading a word, because
                nothing tells them what to do. This does it for them. Pressed
                while the world is still loading, it simply waits. */}
            <button
              className="jrnGateTour"
              data-queued={tourQueued ? "1" : undefined}
              onClick={() => {
                wantTour.current = true;
                setTourQueued(true);
              }}
            >
              {tourQueued ? (
                <>✓ Tour starts when we land</>
              ) : (
                <>▶ Show me around <em>· ~{TOUR_MINUTES} min, skip any time</em></>
              )}
            </button>
          </div>
        </div>
      )}

      {/* HUD — only once the reveal has completed */}
      {phase === "ready" && (
        <>
          <button className="jrnSkip" onClick={() => toClassic()}>
            Skip to classic view →
          </button>

          {/* The left rail: the stop list, with the trail map parked under it.
              They're one flex column rather than two independently-placed
              cards, so the map can never land on top of the menu however far
              the menu's content runs — see .jrnLeft. */}
          <div className="jrnLeft">
            {/* Who this is. The journey opens straight into a snowy world with
                no chrome that names its owner — this nameplate sits above the
                trail menu so "whose portfolio is this?" is answered at a
                glance, from the first frame onward. */}
            <nav className="jrnMenu" aria-label="Trail stops" data-lenis-prevent>
              <div className="jrnWho">
                <div className="jrnWhoName">{profile.name}</div>
                <div className="jrnWhoRole">{profile.title}</div>
                <div className="jrnWhoKicker">Résumé · walk it in 3D</div>
              </div>
              <div className="jrnMenuTitle">The Trail</div>
              {STOPS.filter((s) => s.id !== "contact").map((s) => (
                <button
                  key={s.id}
                  className="jrnMenuItem"
                  data-active={s.id === activeId ? "1" : undefined}
                  disabled={walking}
                  onClick={() => warpTo(s.id)}
                >
                  <span className="jrnZone" data-zone={s.zone} />
                  <span className="jrnMenuText">
                    <b>{s.id === "start" ? "The Architect" : s.label}</b>
                    {/* The place name alone means nothing to a first-time
                        visitor ("The Root"? "The Arc"?) — say what.s there. */}
                    <em>{s.sub}</em>
                  </span>
                </button>
              ))}
              <button
                className={"jrnMenuItem jrnSocialMenuItem"}
                type="button"
                data-active={activeId === "contact" ? "1" : undefined}
                disabled={walking}
                onClick={openSocialTrail}
              >
                <span className={"jrnSocialMenuIcon"} aria-hidden="true">✦</span>
                <span className={"jrnMenuText"}>
                  <b>Social Trail</b>
                  <em>Social links · direct message</em>
                </span>
              </button>
            </nav>

            {/* Nobody has to know the map to see the whole résumé — this walks
                it for them. Sits under the Trail menu so the offer is standing
                whenever they run out of ideas, not only on the title card.
                Outside the <nav> because the stop list scrolls once the rail
                is tight, and this offer must never scroll out of sight. */}
            {!tourAt && (
              <button className="jrnTour" onClick={startTour}>
                <b>▶ Show me around</b>
                <em>~{TOUR_MINUTES} min · every stop, teleported for you</em>
              </button>
            )}

            {/* The map TELEPORTS rather than routing — see warpToPoint above.
                The Trail menu, signposts, map, and guided tour all
                use teleport arrival shots; walking remains available for
                manual movement, but is not forced between destinations. */}
            <JourneyMap
              active
              activeId={activeId}
              onPick={warpTo}
              onPickAnchor={warpToAnchor}
            />
          </div>

          {/* The tour's own control strip. It replaces the Stop pill (same
              bottom-centre slot) and carries the guide's line for the current
              destination while its arrival shot plays. */}
          {tourAt && (
            <div className="jrnTourBar">
              <div className="jrnTourFill">
                <span style={{ transform: `scaleX(${(tourAt.beat + 1) / TOUR.length})` }} />
              </div>
              <div className="jrnTourStep">
                {tourAt.beat + 1}/{TOUR.length}
              </div>
              <div className="jrnTourMain">
                <b>{beatTitle(TOUR[tourAt.beat])}</b>
                <span>{TOUR[tourAt.beat].say}</span>
              </div>
              <button className="jrnTourNext" onClick={() => advanceBeat(tourAt.beat)}>
                Next ›
              </button>
              <button className="jrnTourEnd" onClick={cancelWalk} title="End the tour (Esc)">
                End
              </button>
            </div>
          )}

          {showWelcome && !tourAt && !displayFocus && (
            <aside className="jrnWelcome" aria-labelledby="jrn-welcome-title">
              <button
                className="jrnWelcomeClose"
                type="button"
                onClick={() => setShowWelcome(false)}
                aria-label="Close introduction"
              >
                ×
              </button>
              <div className="jrnWelcomeEyebrow">Welcome to The Root</div>
              <h2 id="jrn-welcome-title">Hi, I’m Sujit.</h2>
              <p>
                I’m an Engineering Head with {profile.yearsExperience}+ years building
                and modernizing scalable SaaS platforms. I lead architecture and teams,
                and ship production AI with Rails, Python, FastAPI, and agentic workflows.
              </p>
              <div className="jrnWelcomeStats" aria-label="Career highlights">
                <span><b>{profile.yearsExperience}+</b> years engineering</span>
                <span><b>{profile.yearsAI}+</b> years AI / ML</span>
                <span><b>4+</b> years leading teams</span>
              </div>
              <p className="jrnWelcomeHint">
                Click a board to reveal its story, use The Trail to teleport, or follow the coloured lantern routes.
              </p>
              <div className="jrnWelcomeActions">
                <button type="button" onClick={() => setShowWelcome(false)}>
                  Explore freely
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setShowWelcome(false);
                    startTour();
                  }}
                >
                  ▶ Show me around
                </button>
              </div>
            </aside>
          )}

          {/* (The cancel-the-walk pill used to live here. Every destination
              teleports now, so the guided tour is the only thing that walks,
              and it carries its own End button in the tour bar — the pill could
              no longer appear. Esc still cancels, via cancelWalk.) */}

          {displayFocus && presentation && (
            <div
              className="jrnDisplayFocus"
              data-theme={presentation.theme}
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeDisplay();
              }}
            >
              <section
                className="jrnDisplayDialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="jrn-display-title"
              >
                <DisplayAtmosphere theme={presentation.theme} />
                <header className="jrnDisplayBar">
                  <span className="jrnDisplayGlyph" aria-hidden="true">{presentation.glyph}</span>
                  <div>
                    <span>{presentation.kicker}</span>
                    <b id="jrn-display-title">{presentation.title}</b>
                  </div>
                  <button type="button" onClick={closeDisplay} aria-label="Close display">
                    Close <kbd>Esc</kbd>
                  </button>
                </header>
                <div className={"jrnDisplayStage" + (displayFocus.id === "ask" ? " jrnTerminalStage" : "")} data-lenis-prevent>
                  {displayFocus.id === "ask" ? (
                    <MatrixTextFormation key={displayFocus.id}>
                      <AskPanel variant="terminal" autoEngage />
                    </MatrixTextFormation>
                  ) : (
                    <div className={`jrnDisplayContent jrnDisplayContent--${presentation.theme}`}>
                      <MatrixTextFormation key={displayFocus.id}>
                        {displayContent}
                      </MatrixTextFormation>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </>
      )}

      {/* Mini-game HUD: secrets, toasts, the games directory + modals. It hides
          its right-hand controls while a résumé panel is open — that panel is
          the point of the visit and shares the same column. */}
      <GameHud
        active={phase === "ready"}
        nav={nav}
        onGoTo={warpToAnchor}
        // A running tour owns the screen the same way an open panel does —
        // otherwise the games list flickers back in on every walking leg.
        panelOpen={!!panel || !!tourAt || !!displayFocus}
      />
    </div>
  );

  // -------------------------------------------------------------------------
  function renderPanel(id: string) {
    const hash = CLASSIC_HASH[id] ?? (panelProject(id) ? "work" : undefined);
    return <BoardContent id={id} onMore={() => toClassic(hash)} />;
  }
}
