"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  EDGES,
  edgeSamplesXZ,
  edgePointXZ,
  nodeById,
  nearestGraph,
  spineUToPoint,
  SPINE_EDGE_IDS,
} from "@/lib/journey/graph";
import { STOPS, stopNodeId } from "@/lib/journey/sections";
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
// under the pointer, and hovering any marker pops a springy tooltip.
//
// Clicking a marker moves the avatar there using the selected TRAVEL MODE —
// teleport (lib/journey/warp.ts), walk, or run — picked in the left rail and
// mirrored in every tooltip's verb. Stops and junctions land on their node;
// every other marker lands on its own path anchor and hands its WORLD POSITION
// along as the `look`, so a teleport's arrival shot ends framed on the thing
// that was clicked rather than on the road it stands beside.

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

type MapCenter = { x: number; z: number };

// Keep enough of the world visible to retain the minimap's sense of place, but
// crop it just enough that dragging has useful travel in every direction.
const MAP_VIEW_SCALE = 0.72;
const DRAG_SLOP = 5;

function clampMapCenter(
  center: MapCenter,
  bounds: { x: number; z: number; w: number; h: number },
  viewW: number,
  viewH: number,
): MapCenter {
  const halfW = viewW / 2;
  const halfH = viewH / 2;
  return {
    x: Math.min(bounds.x + bounds.w - halfW, Math.max(bounds.x + halfW, center.x)),
    z: Math.min(bounds.z + bounds.h - halfH, Math.max(bounds.z + halfH, center.z)),
  };
}

/** How a click on a destination moves the avatar. */
export type TravelMode = "walk" | "run" | "teleport";

export default function JourneyMap({
  active,
  activeId,
  mode,
  onPick,
  onPickAnchor,
}: {
  active: boolean;
  activeId: string;
  /** The selected travel mode — only changes the verbs in the hint/tooltips;
   *  the click handlers behind onPick/onPickAnchor do the actual moving. */
  mode: TravelMode;
  onPick: (id: string) => void;
  /** `look` is what the marker actually depicts, in world XZ — the building,
   *  the kiosk, the sheet of ice. Omitted for markers that sit on the road
   *  itself, where there's nothing beside it to turn toward. */
  onPickAnchor: (anchor: Anchor, look?: { x: number; z: number }) => void;
}) {
  const [open, setOpen] = useState(true);
  const [tip, setTip] = useState<Tip | null>(null);
  // The verb every tooltip promises — it must match what the click will do.
  const go = mode === "teleport" ? "teleport" : mode;
  const dotRef = useRef<SVGCircleElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

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

  const viewW = vb.w * MAP_VIEW_SCALE;
  const viewH = vb.h * MAP_VIEW_SCALE;
  const [mapCenter, setMapCenter] = useState<MapCenter>(() =>
    clampMapCenter({ x: avatarPos.x, z: avatarPos.z }, vb, viewW, viewH),
  );
  const [dragging, setDragging] = useState(false);
  const view = {
    x: mapCenter.x - viewW / 2,
    z: mapCenter.z - viewH / 2,
    w: viewW,
    h: viewH,
  };

  const centerOnAvatar = useCallback(() => {
    setMapCenter(clampMapCenter({ x: avatarPos.x, z: avatarPos.z }, vb, viewW, viewH));
  }, [vb, viewW, viewH]);

  const panBy = useCallback(
    (dx: number, dz: number) => {
      setMapCenter((center) =>
        clampMapCenter({ x: center.x + dx, z: center.z + dz }, vb, viewW, viewH),
      );
    },
    [vb, viewW, viewH],
  );

  const onPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;

      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= DRAG_SLOP) {
        drag.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        setTip(null);
      }
      if (!drag.moved) return;

      // preserveAspectRatio="meet" can letterbox the SVG. Derive the actual
      // screen-to-world scale so a diagonal drag tracks the pointer exactly.
      const rect = event.currentTarget.getBoundingClientRect();
      const scale = Math.min(rect.width / viewW, rect.height / viewH);
      if (scale > 0) panBy(-dx / scale, -dy / scale);
    },
    [panBy, viewW, viewH],
  );

  const finishDrag = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
    if (drag.moved) {
      // A pointer drag ends with a synthetic click. Swallow that one click so
      // releasing over a marker never teleports the visitor by accident.
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
  }, []);

  const onMapKeyDown = useCallback(
    (event: ReactKeyboardEvent<SVGSVGElement>) => {
      const step = event.shiftKey ? 0.18 : 0.08;
      if (event.key === "ArrowLeft") panBy(-viewW * step, 0);
      else if (event.key === "ArrowRight") panBy(viewW * step, 0);
      else if (event.key === "ArrowUp") panBy(0, -viewH * step);
      else if (event.key === "ArrowDown") panBy(0, viewH * step);
      else if (event.key === "Home") centerOnAvatar();
      else return;
      event.preventDefault();
      setTip(null);
    },
    [centerOnAvatar, panBy, viewW, viewH],
  );

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
        const n = nodeById(stopNodeId(s.id));
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
      ["village", "villagegate", "waterfront"]
        .map((id) => nodeById(id))
        .filter(Boolean)
        .map((n) => ({
          id: n!.id,
          label: n!.label ?? n!.id,
          x: n!.x,
          z: n!.z,
          sub:
            n!.id === "cross"
              ? `Five roads meet at the square — click to ${go} here`
              : `Junction — click to ${go} here`,
        })),
    [go],
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
        sub: `Mini-game kiosk — click to ${go} there`,
        anchor: a.anchor,
      };
    });
    const curling = {
      key: "curling",
      kind: "curl" as const,
      x: (CURL_SHEET.hackX + CURL_SHEET.buttonX) / 2,
      z: (CURL_SHEET.hackZ + CURL_SHEET.buttonZ) / 2,
      title: "Curling on the pond",
      sub: `Frozen-pond game — click to ${go} there`,
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
        sub: `Click to ${go} there, then pelt it`,
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
  }, [go]);

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
          onClick={() => onPickAnchor(libAnchor, { x: LIBRARY.x, z: LIBRARY.z })}
          onMouseEnter={() =>
            show({
              x: LIBRARY.x,
              z: LIBRARY.z,
              title: "Town Library",
              sub: `The old square's civic hall — click to ${go} there`,
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
            onClick={() => onPickAnchor(p.anchor, { x: p.x, z: p.z })}
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
            onClick={() => g.anchor && onPickAnchor(g.anchor, { x: g.x, z: g.z })}
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
              show({ x: s.x, z: s.z, title: s.label, sub: `${s.sub} — click to ${go} here` })
            }
            onMouseLeave={hide}
          >
            <circle cx={s.x} cy={s.z} r={6.5} className="jrnMapHit" />
            <circle cx={s.x} cy={s.z} r={3.4} />
          </g>
        ))}
      </>
    ),
    [edgePolys, games, pois, stops, activeId, libAnchor, go, show, hide, onPick, onPickAnchor],
  );

  if (!active) return null;
  const tipLeft = tip ? Math.min(84, Math.max(16, ((tip.x - view.x) / view.w) * 100)) : 0;
  const tipTop = tip ? ((tip.z - view.z) / view.h) * 100 : 0;
  const tipFlip = tip ? (tip.z - view.z) / view.h < 0.2 : false;

  return (
    <div className="jrnMap" data-open={open ? "1" : undefined}>
      <button className="jrnMapHead" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>🗺 Trail map</span>
        <span className="jrnGamesChev">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <>
          {/* Nobody guesses "teleport" from a map — say it once, above the thing
              it's about. Outside .jrnMapBody on purpose: the tooltip positions
              itself as a percentage of that box, so anything else living in
              there would shift every tooltip off its marker. */}
          <p className="jrnMapHint">
            Drag in any direction · Click a marker to {go === "teleport" ? "teleport" : `${go} there`}
          </p>
          <div className="jrnMapBody">
            <svg
              viewBox={`${view.x} ${view.z} ${view.w} ${view.h}`}
              className="jrnMapSvg"
              data-dragging={dragging ? "1" : undefined}
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onClickCapture={(event) => {
                if (!suppressClick.current) return;
                event.preventDefault();
                event.stopPropagation();
                suppressClick.current = false;
              }}
              onKeyDown={onMapKeyDown}
              role="img"
              aria-label="Draggable top-down map of the road network. Drag or use the arrow keys to explore in any direction. Press Home to center on the avatar. Click a marker to teleport there."
            >
              {/* Static map — roads + all markers — memoized so hovering (which
                  only sets `tip`) never re-renders or regenerates it. */}
              {svgLayers}

              {/* you are here — dot + pulsing halo (spawns on the Town Square) */}
              <circle ref={ringRef} cx={-2} cy={-72} r={5} className="jrnMapYouRing" />
              <circle ref={dotRef} cx={-2} cy={-72} r={2.6} className="jrnMapYou" />
            </svg>

            <button
              type="button"
              className="jrnMapLocate"
              onClick={centerOnAvatar}
              aria-label="Center map on my location"
              title="Center on me (Home)"
            >
              ◎
            </button>

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
        </>
      )}
    </div>
  );
}
