"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { walkHeight } from "@/lib/journey/terrain";
import { fbm, lerp, smoothstep } from "@/lib/journey/noise";
import { TRAIL_HALF_WIDTH } from "@/lib/journey/config";
import { STOPS } from "@/lib/journey/sections";
import { NODES, nodeById, SPINE_EDGE_IDS, VILLAGE_EDGE_IDS } from "@/lib/journey/graph";

// Cross-section columns (fraction of half-width): true center + soft shoulders,
// so the road can be tinted lighter down the walked middle and darker at its
// damp, grassy verges.
const COLS = [-1, -0.45, 0, 0.45, 1];
// Winter trail: a worn, faintly earthy packed-snow tread down the walked middle,
// fading to clean white snow at the verges.
const CENTER: [number, number, number] = [0.66, 0.63, 0.58]; // trodden packed snow
const EDGE: [number, number, number] = [0.86, 0.88, 0.93]; // clean snow shoulder
// Roads OFF the grand tour read as a DIFFERENT kind of path — a narrower,
// less-trodden lane with a frosty blue-grey tread — so a crossroads on screen
// is visibly several distinct roads, not white-on-white. (In fog an identical
// tint hid the branches.)
const LOOP_CENTER: [number, number, number] = [0.52, 0.6, 0.7];
const LOOP_EDGE: [number, number, number] = [0.78, 0.85, 0.95];

// Sweep the worn packed-snow ribbon along ONE edge curve. Sample count scales
// with the edge's length so short village lanes and the long forest stretches
// get the same ~1 m fidelity.
function buildRibbon(curve: THREE.CatmullRomCurve3, scenic: boolean): THREE.BufferGeometry {
  const N = Math.max(24, Math.round(curve.getLength() * 1.1));
  const COLW = COLS.length;
  const halfW = TRAIL_HALF_WIDTH * (scenic ? 0.68 : 0.95);
  const C = scenic ? LOOP_CENTER : CENTER;
  const E = scenic ? LOOP_EDGE : EDGE;
  const pos: number[] = [];
  const colr: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const perp = new THREE.Vector3();
  const t = new THREE.Vector3();

  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const p = curve.getPointAt(u);
    t.copy(curve.getTangentAt(u)).normalize();
    perp.crossVectors(t, up).normalize();
    for (const f of COLS) {
      const x = p.x + perp.x * halfW * f;
      const z = p.z + perp.z * halfW * f;
      // walkHeight: over the pond the ribbon rides the bridge DECK (the snow
      // tread on the planks), not the basin floor.
      pos.push(x, walkHeight(x, z) + 0.06, z);

      // Center bright and walked, shoulders darker; wear patches along length.
      const across = smoothstep(0.15, 1, Math.abs(f));
      const wear = fbm(u * 26, f * 3, 1) * 0.5 + 0.5;
      const k = (0.86 + wear * 0.3) * 1;
      colr.push(
        lerp(C[0], E[0], across) * k,
        lerp(C[1], E[1], across) * k,
        lerp(C[2], E[2], across) * k,
      );
    }
  }
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < COLW - 1; c++) {
      const a = i * COLW + c;
      const b = i * COLW + c + 1;
      const cc = (i + 1) * COLW + c;
      const d = (i + 1) * COLW + c + 1;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A sign the visitor can click: résumé stops (their marker text), and the
// scenic-loop junctions ("Pond Walk" / "Ridge Lookout") that steer the walk
// down a branch. dx/dz nudge the post off the path shoulder.
type Sign = {
  id: string;
  marker: string;
  sub?: string; // résumé stops: what's waiting there, in plain words
  x: number;
  z: number;
  dx: number;
  dz: number;
};

// One walked road per PATH-GRAPH edge — the spine and both scenic loops — plus
// the clickable signposts. The ribbons share the avatar's edge curves so
// character and paths can never drift apart.
export default function TrailPath({
  edgeCurves,
  activeId,
  onPick,
}: {
  edgeCurves: Map<string, THREE.CatmullRomCurve3>;
  activeId: string;
  onPick: (id: string) => void;
}) {
  const ribbons = useMemo(
    () =>
      [...edgeCurves.entries()]
        // The village lane's geometry IS the side road — SideRoad.tsx already
        // draws that roadbed, so a second coplanar ribbon would z-fight it.
        .filter(([id]) => !VILLAGE_EDGE_IDS.has(id))
        .map(([id, c]) => ({
          id,
          geo: buildRibbon(c, !SPINE_EDGE_IDS.has(id)),
        })),
    [edgeCurves],
  );

  const signs = useMemo<Sign[]>(() => {
    const out: Sign[] = [];
    // Résumé stops keep their marker boards, planted at the stop node. Each
    // stop is now a JUNCTION with roads fanning out, so the classic +2.4 east
    // offset stands in a lane mouth at several of them — the audited per-stop
    // offsets below dodge every incident lane (design_map.ts).
    const STOP_OFF: Record<string, [number, number]> = {
      thesis: [-2.8, 0], // east side is the waterfront arc's mouth
      skills: [-2.6, 0], // east side is the NW road arriving from town
      ask: [-2.6, -2.5], // north-east is the Crossroads spoke's mouth
      contact: [0, -2.6], // roads arrive N/E/W — the board stands behind the summit
    };
    for (const s of STOPS) {
      const n = nodeById(s.id);
      if (!n) continue;
      const [dx, dz] = STOP_OFF[s.id] ?? [2.4, 0];
      out.push({ id: s.id, marker: s.marker, sub: s.sub, x: n.x, z: n.z, dx, dz });
    }
    // Junction boards — clickable, they steer the walk to that junction: the
    // Village Lane (side road), the Town Gate (4-way) and the Crossroads
    // (5-way). The Pond Bridge junction gets NO board: every clear spot around
    // the abutment is a lane or open water (audited) — the bridge itself is the
    // landmark, and it stays clickable on the trail map.
    const JUNCTION_OFF: Record<string, [number, number]> = {
      village: [-3.4, -0.4],
      villagegate: [2.3, -2.3],
      cross: [-1.9, -5.7],
    };
    for (const n of NODES) {
      if (n.kind !== "junction") continue;
      const off = JUNCTION_OFF[n.id];
      if (!off) continue;
      out.push({ id: n.id, marker: n.label ?? n.id, x: n.x, z: n.z, dx: off[0], dz: off[1] });
    }
    return out;
  }, []);

  return (
    <group>
      {ribbons.map(({ id, geo }) => (
        <mesh key={id} geometry={geo} receiveShadow>
          <meshStandardMaterial
            vertexColors
            roughness={1}
            metalness={0}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ))}

      {signs.map((s) => (
        <Signpost
          key={`${s.id}:${s.x.toFixed(0)}`}
          sign={s}
          active={s.id === activeId}
          onPick={onPick}
        />
      ))}
    </group>
  );
}

function Signpost({
  sign,
  active,
  onPick,
}: {
  sign: Sign;
  active: boolean;
  onPick: (id: string) => void;
}) {
  // Plant the post just off the path shoulder.
  const x = sign.x + sign.dx;
  const z = sign.z + sign.dz;
  const y = walkHeight(x, z);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[0.12, 2.2, 0.12]} />
        <meshStandardMaterial color="#6b5334" roughness={1} />
      </mesh>
      <mesh position={[0.35, 1.9, 0]} rotation={[0, 0, -0.08]} castShadow>
        <boxGeometry args={[1.5, 0.5, 0.08]} />
        <meshStandardMaterial color={active ? "#c98a3a" : "#8a6a3f"} roughness={1} />
      </mesh>
      <Html
        position={[0.35, 2.55, 0]}
        center
        distanceFactor={16}
        occlude={false}
        style={{ pointerEvents: "auto" }}
      >
        <button
          className="jrnSign"
          data-active={active ? "1" : undefined}
          onClick={() => onPick(sign.id)}
        >
          {sign.marker}
          {/* Place names alone ("The Arc") don't tell a visitor what's here. */}
          {sign.sub && <span className="jrnSignSub">{sign.sub}</span>}
        </button>
      </Html>
    </group>
  );
}
