"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EDGES,
  edgeSamplesXZ,
  edgePointXZ,
  nodeById,
  nearestGraph,
  spineUToPoint,
  SPINE_EDGE_IDS,
} from "@/lib/journey/graph";
import { STOPS } from "@/lib/journey/sections";
import { SETTLEMENT_PLOTS, FOUNTAINS, LIBRARY } from "@/lib/journey/settlement";
import { PROJECT_SITES } from "@/lib/journey/projects";
import { POND, CURL_SHEET } from "@/lib/journey/config";
import { ATTRACTIONS, KIOSK_PLACES, type Anchor } from "@/lib/journey/attractions";
import { OBSTACLES } from "./Obstacles";
import { SECRETS, SECRET_OFFSET } from "./Collectibles";
import { TARGETS, TARGET_OFFSET } from "./Snowballs";
import { avatarPos } from "@/lib/journey/game";

// The trail MAP — a top-down SVG in the HUD that makes the road NETWORK
// legible: the circular town, the grand tour (solid), every network road
// (dashed), the pond + bridge, all the buildings, and a marker for EVERYTHING
// there is to find — every résumé stop, every junction, both fountains, and
// every game (kiosks, curling, snowball targets, hidden gems, the obstacle
// run) — plus a live, pulsing you-are-here dot. The whole map fluidly grows
// under the pointer, and hovering any marker pops a springy tooltip; clicking
// walks the avatar there (stops/junctions route by node, game markers route to
// their exact path point).

// World→SVG: x maps straight across, z maps straight down (the trail walks
// "up" the map toward the summit). Strokes/labels are in px via
// non-scaling-stroke + a fixed font size scaled by the viewBox.
//
// The graph's edge samples sit ~1 m apart — sub-pixel on a ~180 px minimap, so
// ~5× over-resolved. Keep the endpoints and every Nth interior point: the tour
// curves are gentle, so this is visually identical while cutting the polyline
// vertex count (and the per-render string work) ~4×. 927 → ~250 vertices.
const MAP_STRIDE = 4;
function polyPoints(samples: [number, number][]): string {
  const out: string[] = [];
  const last = samples.length - 1;
  for (let i = 0; i <= last; i++) {
    if (i === 0 || i === last || i % MAP_STRIDE === 0)
      out.push(`${samples[i][0].toFixed(1)},${samples[i][1].toFixed(1)}`);
  }
  return out.join(" ");
}

// A grand-tour point (+ lateral offset) in world XZ — mirrors how the games
// place themselves along the tour.
function tourXZ(u: number, side = 0, lat = 0): { x: number; z: number; anchor: Anchor } {
  const at = spineUToPoint(u);
  const p = edgePointXZ(at.edgeId, at.tAB);
  const a = edgePointXZ(at.edgeId, Math.min(1, at.tAB + 0.02));
  const b = edgePointXZ(at.edgeId, Math.max(0, at.tAB - 0.02));
  let px = -(a[1] - b[1]);
  let pz = a[0] - b[0];
  const l = Math.hypot(px, pz) || 1;
  px /= l;
  pz /= l;
  return {
    x: p[0] + px * lat * side,
    z: p[1] + pz * lat * side,
    anchor: { edgeId: at.edgeId, tAB: at.tAB },
  };
}

type Tip = { x: number; z: number; title: string; sub: string };

export default function JourneyMap({
  active,
  activeId,
  onPick,
  onPickAnchor,
}: {
  active: boolean;
  activeId: string;
  onPick: (id: string) => void;
  onPickAnchor: (anchor: Anchor) => void;
}) {
  const [open, setOpen] = useState(true);
  const [tip, setTip] = useState<Tip | null>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);

  // ViewBox hugging every edge sample AND every off-road landmark (buildings,
  // fountains — the library stands past the street's head, so edges alone
  // would clip its marker), + margin.
  const vb = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    const take = (x: number, z: number, r = 0) => {
      minX = Math.min(minX, x - r);
      maxX = Math.max(maxX, x + r);
      minZ = Math.min(minZ, z - r);
      maxZ = Math.max(maxZ, z + r);
    };
    for (const e of EDGES) {
      for (const [x, z] of edgeSamplesXZ(e.id)) take(x, z);
    }
    for (const p of SETTLEMENT_PLOTS) take(p.x, p.z, 3);
    for (const f of FOUNTAINS) take(f.x, f.z, 3);
    const pad = 10;
    return {
      x: minX - pad,
      z: minZ - pad,
      w: maxX - minX + pad * 2,
      h: maxZ - minZ + pad * 2,
    };
  }, []);

  // Live you-are-here dot — written straight to the SVG nodes (no React churn).
  // Only touch the DOM when the avatar has actually moved (a 0.1 m grid): idle is
  // the common case, and skipping the writes avoids repainting the dot's region
  // every frame while standing still.
  useEffect(() => {
    if (!active || !open) return;
    let raf = 0;
    let lastX = NaN;
    let lastY = NaN;
    const tick = () => {
      const cx = Math.round(avatarPos.x * 10) / 10;
      const cy = Math.round(avatarPos.z * 10) / 10;
      if (cx !== lastX || cy !== lastY) {
        lastX = cx;
        lastY = cy;
        const sx = String(cx);
        const sy = String(cy);
        dotRef.current?.setAttribute("cx", sx);
        dotRef.current?.setAttribute("cy", sy);
        ringRef.current?.setAttribute("cx", sx);
        ringRef.current?.setAttribute("cy", sy);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, open]);

  const stops = useMemo(
    () =>
      STOPS.map((s) => {
        const n = nodeById(s.id);
        return n ? { id: s.id, label: s.label, sub: s.sub, x: n.x, z: n.z } : null;
      }).filter(Boolean) as {
        id: string;
        label: string;
        sub: string;
        x: number;
        z: number;
      }[],
    [],
  );
  const pois = useMemo(
    () =>
      ["village", "villagegate", "waterfront", "cross"]
        .map((id) => nodeById(id))
        .filter(Boolean)
        .map((n) => ({
          id: n!.id,
          label: n!.label ?? n!.id,
          x: n!.x,
          z: n!.z,
          sub:
            n!.id === "cross"
              ? "Five roads meet at the square — click to walk here"
              : "Junction — click to walk here",
        })),
    [],
  );
  // Where a click on the library marker delivers you: the nearest road point
  // to its forecourt (the street's head in the Old Town).
  const libAnchor = useMemo(() => {
    const g = nearestGraph(LIBRARY.x, LIBRARY.z - LIBRARY.front - 1);
    return { edgeId: g.edgeId, tAB: g.t };
  }, []);

  // Game markers, all carrying the path anchor their click walks to.
  const games = useMemo(() => {
    const att = (id: string) => ATTRACTIONS.find((a) => a.id === id);
    const kiosks = (["tictactoe", "match"] as const).map((k) => {
      const a = att(k)!;
      return {
        key: `kiosk-${k}`,
        kind: "kiosk" as const,
        x: KIOSK_PLACES[k].x,
        z: KIOSK_PLACES[k].z,
        title: a.label,
        sub: "Mini-game kiosk — click to walk over",
        anchor: a.anchor,
      };
    });
    const curling = {
      key: "curling",
      kind: "curl" as const,
      x: (CURL_SHEET.hackX + CURL_SHEET.buttonX) / 2,
      z: (CURL_SHEET.hackZ + CURL_SHEET.buttonZ) / 2,
      title: "Curling on the pond",
      sub: "Frozen-pond game — click to walk over",
      anchor: att("curling")!.anchor,
    };
    const snowmen = TARGETS.map((t, i) => {
      const p = tourXZ(t.u, t.side, TARGET_OFFSET);
      return {
        key: `snowman-${i}`,
        kind: "snowman" as const,
        x: p.x,
        z: p.z,
        title: `Snowball target ${i + 1}/${TARGETS.length}`,
        sub: "Click to walk over, then pelt it",
        anchor: p.anchor,
      };
    });
    const gems = SECRETS.map((s, i) => {
      const p = tourXZ(s.u, s.side, SECRET_OFFSET);
      return {
        key: `gem-${i}`,
        kind: "gem" as const,
        x: p.x,
        z: p.z,
        title: `Hidden secret ${i + 1}/${SECRETS.length}`,
        sub: "Run through the ✦ to collect it",
        anchor: p.anchor,
      };
    });
    const obstacles = OBSTACLES.map((o, i) => {
      const p = tourXZ(o.u);
      return {
        key: `obst-${i}`,
        kind: "obst" as const,
        x: p.x,
        z: p.z,
        title: o.kind === "log" ? "Snow log" : "Ice rock",
        sub: "Vault it (Space) or kick it clear",
        anchor: p.anchor,
      };
    });
    return [...kiosks, curling, ...snowmen, ...gems, ...obstacles];
  }, []);

  // Precomputed, downsampled polyline strings — built ONCE (deps []), not on
  // every render. Feeds the memoized layer below so a hover never regenerates
  // them.
  const edgePolys = useMemo(
    () =>
      EDGES.map((e) => ({
        id: e.id,
        cls: SPINE_EDGE_IDS.has(e.id) ? "jrnMapSpine" : "jrnMapLoop",
        points: polyPoints(edgeSamplesXZ(e.id)),
      })),
    [],
  );

  // Stable tooltip open/close handlers, so the memoized layer's marker handlers
  // keep referential identity across renders (no needless rebuilds).
  const show = useCallback((t: Tip) => setTip(t), []);
  const hide = useCallback(() => setTip(null), []);

  // The ENTIRE static map — roads, buildings, and every clickable marker — as a
  // single memoized element. It depends only on the route highlight (activeId)
  // and stable data/handlers, so hovering a marker (which sets `tip`) reuses
  // this exact subtree and React skips reconciling it. Only the live you-are-
  // here dot (written imperatively) and the tooltip re-render on interaction.
  const svgLayers = useMemo(
    () => (
      <>
        {/* pond */}
        <circle cx={POND.x} cy={POND.z} r={POND.radius} className="jrnMapPond" />

        {/* buildings — the town rows AND the countryside homesteads. Project
            landmarks are plots too (they claim a pad + a clearing) but they get
            their own marker below, so they're filtered out here. */}
        {SETTLEMENT_PLOTS.filter((p) => p.kind !== "project").map((p, i) => (
          <rect
            key={i}
            x={p.x - 2}
            y={p.z - 2}
            width={4}
            height={4}
            className="jrnMapPlot"
            data-kind={p.kind}
          />
        ))}

        {/* paths: grand tour solid, network roads dashed + tinted */}
        {edgePolys.map((e) => (
          <polyline key={e.id} points={e.points} className={e.cls} />
        ))}

        {/* fountains */}
        {FOUNTAINS.map((f, i) => (
          <g
            key={`f${i}`}
            className="jrnMapMark jrnMapFountain"
            onMouseEnter={() =>
              show({
                x: f.x,
                z: f.z,
                title: f.grand ? "Town Square fountain" : "Library fountain",
                sub: f.grand
                  ? "The grand frozen centrepiece where you spawn"
                  : "The forecourt of the town library",
              })
            }
            onMouseLeave={hide}
          >
            <circle cx={f.x} cy={f.z} r={5} className="jrnMapHit" />
            <circle cx={f.x} cy={f.z} r={f.grand ? 2.6 : 2.1} />
            <circle cx={f.x} cy={f.z} r={f.grand ? 1.1 : 0.9} className="jrnMapFountainCore" />
          </g>
        ))}

        {/* the town library on the old square — clickable, walks to its
            forecourt */}
        <g
          className="jrnMapMark jrnMapLib"
          onClick={() => onPickAnchor(libAnchor)}
          onMouseEnter={() =>
            show({
              x: LIBRARY.x,
              z: LIBRARY.z,
              title: "Town Library",
              sub: "The old square's civic hall — click to visit",
            })
          }
          onMouseLeave={hide}
        >
          <circle cx={LIBRARY.x} cy={LIBRARY.z} r={5.5} className="jrnMapHit" />
          <rect x={LIBRARY.x - 2.7} y={LIBRARY.z - 1.5} width={5.4} height={4} />
          <polygon
            points={`${LIBRARY.x - 3.2},${LIBRARY.z - 1.5} ${LIBRARY.x + 3.2},${LIBRARY.z - 1.5} ${LIBRARY.x},${LIBRARY.z - 3.6}`}
          />
        </g>

        {/* project landmarks — the work, built into the world. Clicking one
            walks you to its road; the plaque there opens the full card. */}
        {PROJECT_SITES.map((p) => (
          <g
            key={p.id}
            className="jrnMapMark jrnMapProject"
            onClick={() => onPickAnchor(p.anchor)}
            onMouseEnter={() => show({ x: p.x, z: p.z, title: p.title, sub: p.project })}
            onMouseLeave={hide}
          >
            <circle cx={p.x} cy={p.z} r={5.4} className="jrnMapHit" />
            <polygon
              points={`${p.x},${p.z - 3.4} ${p.x + 3},${p.z + 2.2} ${p.x - 3},${p.z + 2.2}`}
            />
          </g>
        ))}

        {/* games — kiosks, curling, snowmen, gems, obstacles */}
        {games.map((g) => (
          <g
            key={g.key}
            className={`jrnMapMark jrnMapGame jrnMapG-${g.kind}`}
            onClick={() => g.anchor && onPickAnchor(g.anchor)}
            onMouseEnter={() => show({ x: g.x, z: g.z, title: g.title, sub: g.sub })}
            onMouseLeave={hide}
          >
            <circle cx={g.x} cy={g.z} r={4.6} className="jrnMapHit" />
            {g.kind === "kiosk" && (
              <rect
                x={g.x - 2.2}
                y={g.z - 2.2}
                width={4.4}
                height={4.4}
                transform={`rotate(45 ${g.x} ${g.z})`}
              />
            )}
            {g.kind === "curl" && <circle cx={g.x} cy={g.z} r={2.6} />}
            {g.kind === "snowman" && <circle cx={g.x} cy={g.z} r={2.1} />}
            {g.kind === "gem" && (
              <rect
                x={g.x - 1.6}
                y={g.z - 1.6}
                width={3.2}
                height={3.2}
                transform={`rotate(45 ${g.x} ${g.z})`}
              />
            )}
            {g.kind === "obst" && <rect x={g.x - 1.5} y={g.z - 1.5} width={3} height={3} />}
          </g>
        ))}

        {/* junction waypoints — clickable, steer the network roads */}
        {pois.map((p) => (
          <g
            key={p.id}
            className="jrnMapMark jrnMapPoi"
            onClick={() => onPick(p.id)}
            onMouseEnter={() => show({ x: p.x, z: p.z, title: p.label, sub: p.sub })}
            onMouseLeave={hide}
          >
            <circle cx={p.x} cy={p.z} r={5} className="jrnMapHit" />
            <circle cx={p.x} cy={p.z} r={2.6} />
          </g>
        ))}

        {/* résumé stops — clickable */}
        {stops.map((s) => (
          <g
            key={s.id}
            className="jrnMapMark jrnMapStop"
            data-active={s.id === activeId ? "1" : undefined}
            onClick={() => onPick(s.id)}
            onMouseEnter={() =>
              show({ x: s.x, z: s.z, title: s.label, sub: `${s.sub} — click to walk here` })
            }
            onMouseLeave={hide}
          >
            <circle cx={s.x} cy={s.z} r={6.5} className="jrnMapHit" />
            <circle cx={s.x} cy={s.z} r={3.4} />
          </g>
        ))}
      </>
    ),
    [edgePolys, games, pois, stops, activeId, libAnchor, show, hide, onPick, onPickAnchor],
  );

  if (!active) return null;
  const tipLeft = tip ? Math.min(84, Math.max(16, ((tip.x - vb.x) / vb.w) * 100)) : 0;
  const tipTop = tip ? ((tip.z - vb.z) / vb.h) * 100 : 0;
  const tipFlip = tip ? (tip.z - vb.z) / vb.h < 0.2 : false;

  return (
    <div className="jrnMap" data-open={open ? "1" : undefined}>
      <button className="jrnMapHead" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>🗺 Trail map</span>
        <span className="jrnGamesChev">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="jrnMapBody">
          <svg
            viewBox={`${vb.x} ${vb.z} ${vb.w} ${vb.h}`}
            className="jrnMapSvg"
            role="img"
            aria-label="Top-down map of the road network: the town, every résumé stop, every game, the fountains, and where the avatar is right now"
          >
            {/* Static map — roads + all markers — memoized so hovering (which
                only sets `tip`) never re-renders or regenerates it. */}
            {svgLayers}

            {/* you are here — dot + pulsing halo (spawns on the Town Square) */}
            <circle ref={ringRef} cx={-2} cy={-72} r={5} className="jrnMapYouRing" />
            <circle ref={dotRef} cx={-2} cy={-72} r={2.6} className="jrnMapYou" />
          </svg>

          {/* springy hover tooltip, anchored over the hovered marker */}
          <div
            className="jrnMapTip"
            data-show={tip ? "1" : undefined}
            data-flip={tipFlip ? "1" : undefined}
            style={{ left: `${tipLeft}%`, top: `${tipTop}%` }}
            aria-hidden={!tip}
          >
            <b>{tip?.title}</b>
            <span>{tip?.sub}</span>
          </div>
        </div>
      )}
    </div>
  );
}
