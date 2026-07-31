"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { height } from "@/lib/journey/terrain";
import { applyTopSnow } from "@/lib/journey/snowcover";
import { SETTLEMENT_PLOTS, type Plot } from "@/lib/journey/settlement";
import { B, GlowPane } from "./buildingKit";

// The winter hamlet the trail climbs through: a cluster of snow-roofed log
// cabins composed from Kenney's Holiday kit (modular walls + hip roofs), a
// trading-post shop, a procedural petrol bunk, and a few suburban houses set
// back on the higher ground — dressed with snow trees, a snowman, drifts,
// lanterns and a stray reindeer. Windows glow warm at night (faked with emissive
// panes, since every GLB shares one "colormap" texture — there's no per-window
// material to drive), tracking the same skyExtra.night signal as the street lamps.

const HOLIDAY = (n: string) => `/models/holiday/${n}.glb`;
const CITY = (n: string) => `/models/city/${n}.glb`;

// `B` (flat-shaded box), `GlowPane` (window that lights at night) and WARM now
// live in ./buildingKit — the project landmarks are built from the same kit.

// --- a cloned, Kenney-material-fixed GLB placed in LOCAL space ------------------
function Gltf({
  url,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}: {
  url: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
}) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      const src = m.material as THREE.MeshStandardMaterial;
      const mat = src.clone();
      mat.metalness = 0; // Kenney GLBs ship metalness=1 → render black
      mat.roughness = 0.9;
      mat.flatShading = true;
      applyTopSnow(mat); // snow gathers on roofs / up-facing faces of every building
      m.material = mat;
    });
    return c;
  }, [scene]);
  return <primitive object={obj} position={position} rotation={rotation} scale={scale} />;
}

const HALF_PI = Math.PI / 2;

// A log cabin composed on a 1×1 module (walls y 0..1), then scaled/placed by the
// parent group. Local +Z is the FRONT (faces the trail).
const FRONTS = ["cabin-door-rotate", "cabin-overhang-doorway", "cabin-window-large", "cabin-doorway"];
const ROOFS = ["cabin-roof-snow-point", "cabin-roof-snow-chimney", "cabin-roof-snow-point"];

function Cabin({ variant }: { variant: number }) {
  const front = FRONTS[variant % FRONTS.length];
  const roof = ROOFS[variant % ROOFS.length];
  const frontIsWindow = front === "cabin-window-large";
  const leftIsWindow = variant % 2 === 0;
  const left = leftIsWindow ? "cabin-window-a" : "cabin-wall";

  return (
    <group>
      {/* floor + four walls butted onto the module edges */}
      <Gltf url={HOLIDAY("floor-wood-snow")} />
      <Gltf url={HOLIDAY(front)} rotation={[0, 0, 0]} />
      <Gltf url={HOLIDAY("cabin-wall")} rotation={[0, Math.PI, 0]} />
      <Gltf url={HOLIDAY("cabin-window-a")} rotation={[0, HALF_PI, 0]} />
      <Gltf url={HOLIDAY(left)} rotation={[0, -HALF_PI, 0]} />
      {/* snow hip roof, overhanging the walls */}
      <Gltf url={HOLIDAY(roof)} position={[0, 1.0, 0]} />

      {/* warm windows at night */}
      <GlowPane position={[0.63, 0.55, 0]} rotation={[0, HALF_PI, 0]} size={[0.42, 0.46]} />
      {leftIsWindow && (
        <GlowPane position={[-0.63, 0.55, 0]} rotation={[0, -HALF_PI, 0]} size={[0.42, 0.46]} />
      )}
      {frontIsWindow && (
        <GlowPane position={[0, 0.5, 0.66]} rotation={[0, 0, 0]} size={[0.55, 0.58]} />
      )}
    </group>
  );
}

// The trading post: a cabin with a big shopfront window, a striped awning over
// it, a hanging sign, and a couple of crates out front.
function Shop() {
  return (
    <group>
      <Gltf url={HOLIDAY("floor-wood-snow")} />
      <Gltf url={HOLIDAY("cabin-window-large")} rotation={[0, 0, 0]} />
      <Gltf url={HOLIDAY("cabin-wall")} rotation={[0, Math.PI, 0]} />
      <Gltf url={HOLIDAY("cabin-window-a")} rotation={[0, HALF_PI, 0]} />
      <Gltf url={HOLIDAY("cabin-window-a")} rotation={[0, -HALF_PI, 0]} />
      <Gltf url={HOLIDAY("cabin-roof-snow-point")} position={[0, 1.0, 0]} />

      {/* awning: a shallow tilted slab jutting out over the shopfront */}
      <B args={[1.15, 0.06, 0.5]} position={[0, 0.82, 0.82]} rotation={[0.5, 0, 0]} color="#b23a3a" />
      {/* two little valance posts holding the awning's outer edge */}
      <B args={[0.05, 0.55, 0.05]} position={[-0.5, 0.5, 0.98]} color="#5f4227" />
      <B args={[0.05, 0.55, 0.05]} position={[0.5, 0.5, 0.98]} color="#5f4227" />

      {/* hanging sign board beside the door */}
      <B args={[0.05, 0.5, 0.05]} position={[0.62, 0.75, 0.5]} color="#4a422a" />
      <B args={[0.5, 0.3, 0.04]} position={[0.62, 0.62, 0.5]} color="#6b4e2e" />
      <GlowPane position={[0.62, 0.62, 0.53]} size={[0.4, 0.22]} color="#ffcf72" max={0.8} />

      {/* warm shopfront glow */}
      <GlowPane position={[0, 0.5, 0.66]} size={[0.62, 0.6]} />

      {/* crates on the porch */}
      <B args={[0.32, 0.32, 0.32]} position={[-0.62, 0.16, 0.75]} color="#7a5636" />
      <B args={[0.28, 0.28, 0.28]} position={[-0.62, 0.46, 0.72]} rotation={[0, 0.4, 0]} color="#5f4227" />
    </group>
  );
}

// A procedural petrol bunk in world metres (plot scale 1): a lit canopy on four
// posts over two pumps, with a small kiosk and a price sign. Local +Z faces the
// trail so vehicles pull in from the path.
function PetrolBunk() {
  const KIOSK = "#e2e7ee";
  const CANOPY = "#c0392b";
  const POST = "#3f444d";
  const canopyY = 4.0;
  return (
    <group>
      {/* kiosk at the back */}
      <B args={[3.2, 2.6, 2.6]} position={[0, 1.3, -2.4]} color={KIOSK} />
      <B args={[3.4, 0.3, 2.8]} position={[0, 2.7, -2.4]} color="#cfd5dd" />
      <GlowPane position={[0, 1.3, -1.08]} size={[1.5, 1.0]} max={0.9} />

      {/* canopy roof + four posts */}
      <B args={[6.4, 0.35, 4.4]} position={[0, canopyY, 0.4]} color={CANOPY} />
      <B args={[6.6, 0.18, 4.6]} position={[0, canopyY + 0.22, 0.4]} color="#e6ecf4" roughness={0.9} />
      {[
        [-2.7, -1.5],
        [2.7, -1.5],
        [-2.7, 2.3],
        [2.7, 2.3],
      ].map(([px, pz], i) => (
        <B key={i} args={[0.24, canopyY, 0.24]} position={[px, canopyY / 2, pz]} color={POST} />
      ))}
      {/* warm light spilling from under the canopy at night */}
      <GlowPane
        position={[0, canopyY - 0.22, 0.4]}
        rotation={[HALF_PI, 0, 0]}
        size={[5.8, 3.9]}
        color="#ffe6b0"
        max={0.5}
        additive
      />

      {/* two pumps */}
      {[-1.1, 1.1].map((px, i) => (
        <group key={i} position={[px, 0, 0.6]}>
          <B args={[0.7, 1.5, 0.8]} position={[0, 0.75, 0]} color="#eceff2" />
          <B args={[0.5, 0.4, 0.05]} position={[0, 1.15, 0.42]} color="#20242b" />
          <GlowPane position={[0, 1.15, 0.45]} size={[0.42, 0.3]} color="#7fe0b0" max={0.9} additive />
          {/* hose stub */}
          <B args={[0.08, 0.5, 0.08]} position={[0.42, 0.7, 0.2]} rotation={[0, 0, 0.5]} color="#111418" />
        </group>
      ))}

      {/* price sign on a pole at the entrance */}
      <B args={[0.16, 3.2, 0.16]} position={[3.1, 1.6, 2.6]} color={POST} />
      <B args={[1.3, 1.0, 0.12]} position={[3.1, 3.1, 2.6]} color="#1f6f5c" />
      <GlowPane position={[3.1, 3.1, 2.68]} size={[1.05, 0.8]} color="#eaffe0" max={0.85} additive />
    </group>
  );
}

// THE TOWN LIBRARY — the civic hall on the old square (the town square itself
// moved to the Crossroads). Procedural, in world metres at plot scale 1, in
// the same chunky flat-shaded box language as the petrol bunk: a stone hall
// on a plinth, a four-column portico under a snowy pediment roof, tall arched
// windows that glow warm at night, wide steps down to the forecourt fountain,
// and a carved LIBRARY board over the entrance. Local +Z is the front (the
// plot faces south over the forecourt toward the street's head).
const LIB_WALL = "#c4bcac";
const LIB_TRIM = "#a89f8e";
const LIB_DARK = "#8a8276";
const LIB_COL = "#d3ccbd";
const LIB_ROOF = "#5d6570";
const LIB_SNOW = "#e6ecf4";
const GLASS = "#2c3440";

function LibrarySign() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 88;
    const g = c.getContext("2d")!;
    g.fillStyle = "#463a26";
    g.fillRect(0, 0, 512, 88);
    g.strokeStyle = "#6b5a3a";
    g.lineWidth = 6;
    g.strokeRect(5, 5, 502, 78);
    g.fillStyle = "#f2e7c6";
    g.font = "bold 52px Georgia, 'Times New Roman', serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("L I B R A R Y", 256, 47);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  return (
    <mesh position={[0, 3.77, 3.72]} frustumCulled={false}>
      <planeGeometry args={[3.6, 0.6]} />
      <meshStandardMaterial map={tex} roughness={0.85} metalness={0} />
    </mesh>
  );
}

function Library() {
  const winsFront: [number, number][] = [
    [-2.9, 2.2],
    [2.9, 2.2],
  ];
  const winsSide = [-1.7, 0, 1.7];
  return (
    <group>
      {/* plinth + hall + cornice */}
      <B args={[9.6, 0.5, 6.6]} position={[0, 0.25, 0]} color="#8f887b" />
      <B args={[8.8, 3.6, 5.6]} position={[0, 2.3, 0]} color={LIB_WALL} />
      <B args={[9.2, 0.28, 6.0]} position={[0, 4.24, 0]} color={LIB_TRIM} />

      {/* pitched roof (ridge along the depth) + settled snow + ridge cap */}
      <B args={[5.35, 0.16, 6.4]} position={[-2.4, 5.47, 0]} rotation={[0, 0, 0.42]} color={LIB_ROOF} />
      <B args={[5.35, 0.16, 6.4]} position={[2.4, 5.47, 0]} rotation={[0, 0, -0.42]} color={LIB_ROOF} />
      <B args={[5.15, 0.1, 6.2]} position={[-2.36, 5.58, 0]} rotation={[0, 0, 0.42]} color={LIB_SNOW} roughness={0.95} />
      <B args={[5.15, 0.1, 6.2]} position={[2.36, 5.58, 0]} rotation={[0, 0, -0.42]} color={LIB_SNOW} roughness={0.95} />
      <B args={[0.5, 0.22, 6.5]} position={[0, 6.6, 0]} color={LIB_DARK} />
      <B args={[0.56, 0.1, 6.3]} position={[0, 6.74, 0]} color={LIB_SNOW} />

      {/* gable ends (stepped, front and rear) */}
      {[2.75, -2.75].map((gz) => (
        <group key={gz}>
          <B args={[7.6, 0.72, 0.3]} position={[0, 4.74, gz]} color={LIB_WALL} />
          <B args={[5.2, 0.72, 0.3]} position={[0, 5.46, gz]} color={LIB_WALL} />
          <B args={[2.6, 0.72, 0.3]} position={[0, 6.14, gz]} color={LIB_WALL} />
        </group>
      ))}

      {/* portico: floor, four columns, architrave, sloped snow roof */}
      <B args={[8.6, 0.5, 2.6]} position={[0, 0.25, 3.5]} color="#8f887b" />
      {[-3.5, -1.25, 1.25, 3.5].map((cx) => (
        <B key={cx} args={[0.42, 3.1, 0.42]} position={[cx, 2.05, 3.35]} color={LIB_COL} />
      ))}
      <B args={[8.2, 0.44, 0.7]} position={[0, 3.77, 3.35]} color={LIB_TRIM} />
      <B args={[8.6, 0.14, 1.9]} position={[0, 4.22, 3.4]} rotation={[0.28, 0, 0]} color={LIB_ROOF} />
      <B args={[8.4, 0.09, 1.8]} position={[0, 4.33, 3.4]} rotation={[0.28, 0, 0]} color={LIB_SNOW} roughness={0.95} />
      <LibrarySign />
      <GlowPane position={[0, 3.77, 3.74]} size={[3.5, 0.55]} color="#ffcf72" max={0.3} additive />

      {/* entrance: framed double door + warm transom */}
      <B args={[2.1, 2.9, 0.1]} position={[0, 1.95, 2.79]} color={LIB_DARK} />
      <B args={[1.7, 2.6, 0.12]} position={[0, 1.8, 2.82]} color="#54402c" />
      <GlowPane position={[0, 3.32, 2.87]} size={[1.5, 0.42]} max={0.85} />

      {/* tall windows — front pair, three per flank, rear pair */}
      {winsFront.map(([wx, wy]) => (
        <group key={`f${wx}`}>
          <B args={[1.4, 2.55, 0.06]} position={[wx, wy, 2.8]} color={LIB_TRIM} />
          <B args={[1.15, 2.3, 0.08]} position={[wx, wy, 2.83]} color={GLASS} roughness={0.35} />
          <GlowPane position={[wx, wy, 2.89]} size={[1.05, 2.2]} max={0.9} />
        </group>
      ))}
      {winsSide.map((wz) =>
        ([-1, 1] as const).map((s) => (
          <group key={`s${s}${wz}`}>
            <B args={[0.06, 2.55, 1.4]} position={[s * 4.42, 2.2, wz]} color={LIB_TRIM} />
            <B args={[0.08, 2.3, 1.15]} position={[s * 4.44, 2.2, wz]} color={GLASS} roughness={0.35} />
            <GlowPane
              position={[s * 4.49, 2.2, wz]}
              rotation={[0, (s * Math.PI) / 2, 0]}
              size={[1.05, 2.2]}
              max={0.9}
            />
          </group>
        )),
      )}
      {[-2.2, 2.2].map((wx) => (
        <group key={`r${wx}`}>
          <B args={[1.15, 2.1, 0.08]} position={[wx, 2.3, -2.83]} color={GLASS} roughness={0.35} />
          <GlowPane position={[wx, 2.3, -2.89]} rotation={[0, Math.PI, 0]} size={[1.05, 2.0]} max={0.85} />
        </group>
      ))}

      {/* steps down to the forecourt (front edge z ≈ 6.05, inside the audited 6.2) */}
      <B args={[7.8, 0.34, 0.9]} position={[0, 0.17, 4.85]} color={LIB_TRIM} />
      <B args={[8.2, 0.17, 0.9]} position={[0, 0.085, 5.6]} color={LIB_DARK} />

      {/* a returns-crate by the door, holiday lanterns and drifts at the steps,
          snow trees behind the hall */}
      <B args={[0.34, 0.34, 0.34]} position={[3.15, 0.67, 3.7]} color="#7a5636" />
      <B args={[0.3, 0.3, 0.3]} position={[3.12, 0.97, 3.66]} rotation={[0, 0.5, 0]} color="#5f4227" />
      <Gltf url={HOLIDAY("lantern")} position={[-2.7, 0.5, 4.35]} scale={1.4} />
      <Gltf url={HOLIDAY("lantern")} position={[2.7, 0.5, 4.35]} scale={1.4} />
      <Gltf url={HOLIDAY("snow-pile")} position={[-4.7, 0, 4.8]} scale={1.7} />
      <Gltf url={HOLIDAY("snow-pile")} position={[4.8, 0, 4.6]} scale={1.5} rotation={[0, 1.2, 0]} />
      <Gltf url={HOLIDAY("tree-snow-a")} position={[-5.6, 0, -2.6]} scale={2.6} rotation={[0, 0.7, 0]} />
      <Gltf url={HOLIDAY("tree-snow-b")} position={[5.5, 0, -3.0]} scale={2.4} rotation={[0, 2.1, 0]} />
    </group>
  );
}

// A whole suburban house (Kenney city kit) with a single warm porch glow.
const SUBURBS = ["building-type-a", "building-type-e", "building-type-b", "building-type-k", "building-type-n"];
function Suburb({ variant }: { variant: number }) {
  const key = SUBURBS[variant % SUBURBS.length];
  return (
    <group>
      <Gltf url={CITY(key)} />
      <GlowPane position={[0, 0.4, 0.58]} size={[0.5, 0.5]} max={0.85} />
    </group>
  );
}

// Snow-dusted dressing scattered around a cabin plot (deterministic per variant).
function Dressing({ plot }: { plot: Plot }) {
  // Local offsets are in the plot's own frame: +Z toward the trail, +X to its
  // right. We place a few items in world space around the plot center.
  const items = useMemo(() => {
    const out: { url: string; dx: number; dz: number; s: number; ry: number }[] = [];
    const v = plot.variant;
    // right-hand perpendicular of the facing direction (in world XZ)
    const rx = plot.faceZ; // rotate face by -90°
    const rz = -plot.faceX;
    const fx = plot.faceX; // toward trail
    const fz = plot.faceZ;
    const put = (url: string, side: number, fwd: number, s: number, ry: number) => {
      out.push({ url, dx: rx * side + fx * fwd, dz: rz * side + fz * fwd, s, ry });
    };
    // a snow drift piled against the front-left corner
    put("snow-pile", -2.4, 1.8, 2.0 + (v % 2) * 0.4, v);
    // a holiday lantern by the door
    put("lantern", 1.9, 2.4, 1.3, 0);
    // one or two snow trees to the side / back
    put("tree-snow-a", 3.6 + (v % 3), -1.5, 2.4, v * 1.3);
    if (v % 2 === 0) put("tree-snow-b", -3.8, -2.2, 2.6, v);
    // a snowman out front for one cabin, a reindeer near another
    if (v % 3 === 1) put("snowman-hat", -1.2, 3.2, 1.7, Math.PI + v);
    if (v % 3 === 2) put("reindeer", 4.4, 2.0, 1.6, v * 0.7);
    return out;
  }, [plot]);

  return (
    <>
      {items.map((it, i) => {
        const x = plot.x + it.dx;
        const z = plot.z + it.dz;
        return (
          <Gltf
            key={i}
            url={HOLIDAY(it.url)}
            position={[x, height(x, z) - 0.06, z]}
            rotation={[0, it.ry, 0]}
            scale={it.s}
          />
        );
      })}
    </>
  );
}

function Building({ plot }: { plot: Plot }) {
  const y = height(plot.x, plot.z) - 0.05;
  const common = {
    position: [plot.x, y, plot.z] as [number, number, number],
    rotation: [0, plot.yaw, 0] as [number, number, number],
  };
  if (plot.kind === "petrol") {
    return (
      <group {...common} scale={plot.scale}>
        <PetrolBunk />
      </group>
    );
  }
  if (plot.kind === "suburb") {
    return (
      <group {...common} scale={plot.scale}>
        <Suburb variant={plot.variant} />
      </group>
    );
  }
  if (plot.kind === "shop") {
    return (
      <group {...common} scale={plot.scale}>
        <Shop />
      </group>
    );
  }
  if (plot.kind === "library") {
    return (
      <group {...common} scale={plot.scale}>
        <Library />
      </group>
    );
  }
  return (
    <group {...common} scale={plot.scale}>
      <Cabin variant={plot.variant} />
    </group>
  );
}

export default function Settlement() {
  return (
    <group>
      {/* kind "project" plots are the PROJECT LANDMARKS — they sit in this list
          only to claim a level pad and a forest clearing (settlement.ts).
          Landmarks.tsx builds those structures, so skip them here. */}
      {SETTLEMENT_PLOTS.filter((p) => p.kind !== "project").map((plot, i) => (
        <group key={i}>
          <Building plot={plot} />
          {(plot.kind === "cabin" || plot.kind === "shop") && <Dressing plot={plot} />}
        </group>
      ))}
    </group>
  );
}

// Preload every model so the hamlet pops in together, not piece by piece.
[
  "floor-wood-snow",
  "cabin-wall",
  "cabin-window-a",
  "cabin-window-large",
  "cabin-doorway",
  "cabin-door-rotate",
  "cabin-overhang-doorway",
  "cabin-roof-snow-point",
  "cabin-roof-snow-chimney",
  "tree-snow-a",
  "tree-snow-b",
  "snow-pile",
  "snowman-hat",
  "reindeer",
  "lantern",
].forEach((n) => useGLTF.preload(HOLIDAY(n)));
SUBURBS.forEach((n) => useGLTF.preload(CITY(n)));
