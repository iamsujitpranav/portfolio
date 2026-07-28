"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import Scene from "./Scene";
import GameHud from "./GameHud";
import JourneyMap from "./JourneyMap";
import type { Nav } from "./Avatar";
import { resetGame } from "@/lib/journey/game";
import { STOPS } from "@/lib/journey/sections";
import {
  spawnAt,
  routeToNode,
  routeToPoint,
  assignRoute,
  resetCursor,
  START_NODE,
} from "@/lib/journey/graph";
import { TONEMAP_EXPOSURE } from "@/lib/journey/config";
import { panelProject } from "@/lib/journey/projects";
import { profile, metrics, experience, skillGroups } from "@content/resume";
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

export default function JourneyOverlay() {
  const reduce = useReducedMotion();
  // A single stable, mutable object shared with the canvas (avatar + camera).
  // useMemo (not a ref) keeps it out of render-time ref access. The cursor
  // starts parked at the journey's spawn node on the path graph.
  const nav = useMemo<Nav>(() => {
    const s = spawnAt(START_NODE);
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
  const [walking, setWalking] = useState(false);
  const [launch, setLaunch] = useState(0); // remount key to replay the journey
  const pending = useRef<string>("start");

  const { progress } = useProgress();

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

  const startJourney = useCallback(() => {
    resetGame();
    resetCursor(nav);
    nav.progress = 0;
    nav.moving = false;
    nav.revealed = false;
    setActiveId("cross"); // the spawn node — the Town Square at the five-way
    setPanelId(null);
    pending.current = "start";
    setActive(true);
    setPhase("loading");
    setLaunch((n) => n + 1);
  }, [nav]);

  const walkTo = useCallback(
    (id: string) => {
      // Stop ids double as graph node ids: route from wherever the avatar is.
      // Junction signposts (the scenic loops) route the same way — they just
      // never open a résumé panel on arrival.
      const r = routeToNode(nav.edgeId, nav.tAB, id);
      if (!r) return;
      assignRoute(nav, r, id);
      const isStop = STOPS.some((s) => s.id === id);
      pending.current = isStop ? id : "";
      setActiveId(id);
      setPanelId(null); // hide panel until we arrive
    },
    [nav],
  );

  // Run to an arbitrary point on the path graph — how the Games list gets you
  // to a kiosk or the pond. No résumé panel on arrival: you went there to play.
  const walkToAnchor = useCallback(
    (anchor: { edgeId: string; tAB: number }) => {
      const r = routeToPoint(nav.edgeId, nav.tAB, anchor.edgeId, anchor.tAB);
      if (!r) return;
      assignRoute(nav, r, null);
      pending.current = "";
      setPanelId(null);
    },
    [nav],
  );

  const onArrive = useCallback(() => {
    setPanelId(pending.current || null);
  }, []);

  // Cancel a walk mid-stride — the visitor changed their mind about the
  // destination. Halt the avatar exactly where it stands on the path graph
  // WITHOUT arriving: clearing `pending` first means the arrival callback the
  // Avatar fires the frame the route empties opens no panel and the journey
  // doesn't advance. `moving` flips false on the next avatar frame, which the
  // rAF tick above mirrors into `walking` (re-enabling the menu).
  const cancelWalk = useCallback(() => {
    if (nav.route.length === 0) return; // not walking — nothing to cancel
    pending.current = "";
    nav.route = [];
    nav.step = 0;
    nav.destTab = nav.tAB; // "destination" is now right here
    nav.destNodeId = null;
    setActiveId(""); // stopped between stops — nothing is the current one
    setPanelId(null);
  }, [nav]);

  // Esc is the keyboard twin of the on-screen Stop button. Bound only while the
  // HUD is live, and a no-op when not walking, so it never swallows Esc elsewhere.
  useEffect(() => {
    if (phase !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelWalk();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, cancelWalk]);

  const onLoaded = useCallback(() => setPhase("building"), []);
  const onReady = useCallback(() => {
    setPhase("ready");
    // The avatar spawns on the Town Square (the Crossroads) — mark it current,
    // but open the Trailhead welcome panel as the journey's first words.
    setActiveId("cross");
    setPanelId("start");
  }, []);

  const toClassic = useCallback((hash?: string) => {
    setActive(false);
    setPhase("idle");
    if (hash) {
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
      }, 120);
    }
  }, []);

  const panel = panelId ? renderPanel(panelId) : null;

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
          onPick={walkTo}
          onProject={setPanelId}
          onLoaded={onLoaded}
          onReady={onReady}
          onArrive={onArrive}
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
              Walk a winter trail through my career — every stop on the map is a
              piece of the résumé.
            </p>
            <div className="jrnRing">
              <span style={{ transform: `scaleX(${Math.max(0.04, progress / 100)})` }} />
            </div>
            <p className="jrnGateText">
              {phase === "building" ? "Assembling your guide…" : "Loading the trail…"}
            </p>
          </div>
        </div>
      )}

      {/* HUD — only once the reveal has completed */}
      {phase === "ready" && (
        <>
          <button className="jrnSkip" onClick={() => toClassic()}>
            Skip to classic view →
          </button>

          {/* Who this is. The journey opens straight into a snowy world with no
              chrome that names its owner — this nameplate sits above the trail
              menu so "whose portfolio is this?" is answered at a glance, from
              the first frame onward. */}
          <nav className="jrnMenu" aria-label="Trail stops">
            <div className="jrnWho">
              <div className="jrnWhoName">{profile.name}</div>
              <div className="jrnWhoRole">{profile.title}</div>
              <div className="jrnWhoKicker">Résumé · walk it in 3D</div>
            </div>
            <div className="jrnMenuTitle">The Trail</div>
            {STOPS.map((s) => (
              <button
                key={s.id}
                className="jrnMenuItem"
                data-active={s.id === activeId ? "1" : undefined}
                disabled={walking}
                onClick={() => walkTo(s.id)}
              >
                <span className="jrnZone" data-zone={s.zone} />
                <span className="jrnMenuText">
                  <b>{s.label}</b>
                  {/* The place name alone means nothing to a first-time visitor
                      ("Old Town"? "The Arc"?) — say what's actually there. */}
                  <em>{s.sub}</em>
                </span>
              </button>
            ))}
          </nav>

          {/* Cancel-the-walk pill — floats in the free bottom-centre region so it
              never grows the Trail menu into the map card. Twin of the Esc key. */}
          {walking && (
            <button
              className="jrnStop"
              onClick={cancelWalk}
              aria-label="Stop walking"
              title="Stop walking (Esc)"
            >
              <span className="jrnStopSq" />
              Stop walking · Esc
            </button>
          )}

          {/* data-lenis-prevent: the global Lenis smooth-scroll otherwise eats
              the wheel and this overflowing panel never scrolls. */}
          {panel && (
            <aside className="jrnPanel" data-lenis-prevent key={panelId ?? ""}>
              <button
                className="jrnPanelClose"
                aria-label="Close"
                onClick={() => setPanelId(null)}
              >
                ×
              </button>
              {panel}
            </aside>
          )}
        </>
      )}

      {/* Mini-game HUD: secrets, toasts, the games directory + modals. It hides
          its right-hand controls while a résumé panel is open — that panel is
          the point of the visit and shares the same column. */}
      <GameHud
        active={phase === "ready"}
        nav={nav}
        onWalkTo={walkToAnchor}
        panelOpen={!!panel}
      />
      <JourneyMap
        active={phase === "ready"}
        activeId={activeId}
        onPick={walkTo}
        onPickAnchor={walkToAnchor}
      />
    </div>
  );

  // -------------------------------------------------------------------------
  function renderPanel(id: string) {
    // Project cards hand off to the classic site's work timeline — they're all
    // experience entries, so "work" is the right anchor for every one of them.
    const hash = CLASSIC_HASH[id] ?? (panelProject(id) ? "work" : undefined);
    const More = ({ label }: { label: string }) => (
      <button className="jrnMore" onClick={() => toClassic(hash)}>
        {label} →
      </button>
    );

    // A project landmark's card. Period / role / stack are read out of the
    // résumé by company rather than restated in projects.ts, so a change to
    // content/resume.json flows straight through to the world.
    const site = panelProject(id);
    if (site) {
      const job = experience.find((j) => j.company === site.company);
      return (
        <>
          <div className="jrnEyebrow">{site.title}</div>
          <h2 className="jrnH">{site.project}</h2>
          <p className="jrnTitle">
            {site.company}
            {job ? ` · ${job.period}` : ""}
          </p>
          {job?.role && <p className="jrnRole">{job.role}</p>}
          <p className="jrnLead">{site.blurb}</p>
          {site.metric && (
            <div className="jrnMetrics">
              <div className="jrnMetric">
                <b>{site.metric.value}</b>
                <span>{site.metric.label}</span>
              </div>
            </div>
          )}
          {job?.stack?.length ? (
            <div className="jrnChips">
              {job.stack.slice(0, 8).map((s: string) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          ) : null}
          <p className="jrnReads">
            <b>Why it looks like this</b>
            {site.reads}
          </p>
          <More label="See the full timeline" />
        </>
      );
    }

    switch (id) {
      case "start":
        return (
          <>
            <div className="jrnEyebrow">Trailhead</div>
            <h2 className="jrnH">{profile.name}</h2>
            <p className="jrnTitle">{profile.title}</p>
            <p className="jrnLead">{profile.summary}</p>
            <div className="jrnMetrics">
              {metrics.map((m) => (
                <div key={m.label} className="jrnMetric">
                  <b>{m.value}</b>
                  <span>{m.label}</span>
                </div>
              ))}
            </div>
            <p className="jrnHint">Pick a signpost, or use The Trail menu, to run on.</p>
          </>
        );
      case "thesis":
        return (
          <>
            <div className="jrnEyebrow">The arc</div>
            <blockquote className="jrnQuote">
              Eleven years turning Rails monoliths into resilient microservices —
              now pointed at the hardest layer: making software that{" "}
              <em>reasons</em>. From recommendation engines to{" "}
              <em>agentic developer workflows</em>, I ship AI that earns its place
              in production.
            </blockquote>
            <p className="jrnSig">
              Ruby on Rails · Python · FastAPI · Anthropic Claude · MCP
            </p>
          </>
        );
      case "experience":
        return (
          <>
            <div className="jrnEyebrow">Experience</div>
            <div className="jrnJobs">
              {experience.slice(0, 4).map((j) => (
                <div key={j.company} className="jrnJob">
                  <div className="jrnJobHead">
                    <b>{j.role}</b>
                    <span>{j.period}</span>
                  </div>
                  <div className="jrnJobCo">{j.company}</div>
                  <p>{j.summary}</p>
                  <div className="jrnChips">
                    {j.stack.slice(0, 6).map((s) => (
                      <span key={s}>{s}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <More label="See the full timeline" />
          </>
        );
      case "skills":
        return (
          <>
            <div className="jrnEyebrow">Skills</div>
            <div className="jrnSkills">
              {skillGroups.map((g) => (
                <div key={g.title} className="jrnSkillGroup">
                  <h4>{g.title}</h4>
                  <div className="jrnChips">
                    {(g.star ?? []).map((s) => (
                      <span key={s} className="star">
                        {s}
                      </span>
                    ))}
                    {g.skills.map((s) => (
                      <span key={s}>{s}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        );
      case "ask":
        return (
          <>
            <div className="jrnEyebrow">Ask me</div>
            <h2 className="jrnH">Ask my résumé anything</h2>
            <p className="jrnLead">
              A retrieval-augmented assistant grounded in this exact résumé —
              ask about the AI work, the Rails years, or the leadership calls.
            </p>
            <More label="Open the assistant" />
          </>
        );
      case "contact":
        return (
          <>
            <div className="jrnEyebrow">Summit · Contact</div>
            <h2 className="jrnH">Let’s build something</h2>
            <p className="jrnLead">{profile.openTo}</p>
            <div className="jrnContact">
              <a href={`mailto:${profile.email}`}>{profile.email}</a>
              <a href={`tel:${profile.phone.replace(/\s+/g, "")}`}>{profile.phone}</a>
              <span>{profile.location}</span>
            </div>
            <More label="Open the contact form" />
          </>
        );
      default:
        return null;
    }
  }
}
