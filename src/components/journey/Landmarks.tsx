"use client";

import { useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Billboard, useCursor } from "@react-three/drei";
import { height } from "@/lib/journey/terrain";
import { avatarPos } from "@/lib/journey/game";
import { PROJECT_SITES, projectPanelId, type ProjectStructure } from "@/lib/journey/projects";
import { B, GlowPane } from "./buildingKit";
import type { DisplayFocus } from "./CameraRig";
import MatrixSignFace from "./MatrixSignFace";

// THE PROJECT LANDMARKS — the résumé, built.
//
// Each of these is a real project from content/resume.json standing beside the
// road that leads to the stop its story belongs to. The SHAPE is the argument:
// a hall being dismantled into workshops is the monolith migration, a lookout
// with a sweeping beam is search, a loading dock on a loop is CI/CD. Walk up and
// the plaque tells you which is which; click it and the full card opens in the
// same panel the résumé stops use.
//
// All hand-built in world metres from the shared kit (./buildingKit), same as
// the library and the petrol bunk. Placement is audited (see projects.ts and
// scratchpad/landmark_audit.ts) and each site claims a level terrain pad + a
// forest clearing by way of a "project" plot in settlement.ts.

// --- palette ------------------------------------------------------------------
const STONE = "#8d8579";
const STONE_DK = "#6f695f";
const TIMBER = "#5b452d";
const TIMBER_DK = "#42331f";
const ROOF = "#5f5348";
const SNOW = "#e6ecf4";
const METAL = "#6d7480";
const METAL_DK = "#464c55";
const CRATE = "#7a5636";
const RUST = "#a4552f";
// Instrument glow. Kept off pure white — anything over the composer's 0.82
// bloom threshold flares into a disc (the sun-disc bug, twice).
const SCREEN = "#7fe0c0";
const SCREEN_AMBER = "#ffc98a";

/** How close the avatar has to be for a plaque to light up and show its line. */
const NEAR_M = 22;

// --- 1. The Foundry — large-scale monolith modernization -----------------------
// One big hall being REBUILT under scaffolding — not demolished: the modernization
// kept the monolith running, it did not decompose it into services. Newer
// workshops stand alongside it, joined by lit conduits. Open-ended on the right,
// where the scaffold stands; the workshops face the road.
function Foundry() {
  const shops = [-5.2, 0, 5.2];
  return (
    <group>
      {/* the monolith: a long stone hall, roof stepping DOWN to the right where
          it's being taken apart */}
      <B args={[14, 0.6, 8.4]} position={[0, 0.3, -3]} color={STONE_DK} />
      <B args={[13, 6.4, 7.6]} position={[-0.5, 3.5, -3]} color={STONE} />
      {/* intact roof over the left two thirds only */}
      <B args={[8.6, 0.4, 8]} position={[-2.7, 6.9, -3]} color={ROOF} />
      <B args={[8.4, 0.2, 7.8]} position={[-2.7, 7.15, -3]} color={SNOW} roughness={0.95} />
      {/* the open end: stepped wall stubs where the roof has come off */}
      {[
        [3.4, 5.6],
        [4.9, 4.9],
        [6.1, 4.2],
      ].map(([sx, sy], i) => (
        <B key={i} args={[1.3, sy, 7.6]} position={[sx, sy / 2 + 0.6, -3]} color={STONE} />
      ))}

      {/* scaffolding over the open end — uprights, ledgers, a plank deck */}
      {[2.6, 4.6, 6.6].map((px) =>
        [-6.4, 0.4].map((pz) => (
          <B key={`${px}:${pz}`} args={[0.14, 7.4, 0.14]} position={[px, 3.7, pz]} color={METAL} />
        )),
      )}
      {[2.2, 4.6, 7.0].map((py) => (
        <B key={py} args={[4.6, 0.1, 0.1]} position={[4.6, py, -6.4]} color={METAL} />
      ))}
      {[2.2, 4.6, 7.0].map((py) => (
        <B key={`f${py}`} args={[4.6, 0.1, 0.1]} position={[4.6, py, 0.4]} color={METAL} />
      ))}
      <B args={[4.8, 0.12, 1.5]} position={[4.6, 4.66, -0.2]} color={TIMBER} />
      <B args={[4.8, 0.12, 1.5]} position={[4.6, 7.06, -0.2]} color={TIMBER} />

      {/* gantry over the hall */}
      <B args={[0.28, 8.6, 0.28]} position={[-7.2, 4.3, 1.2]} color={METAL_DK} />
      <B args={[0.28, 8.6, 0.28]} position={[7.6, 4.3, 1.2]} color={METAL_DK} />
      <B args={[15.2, 0.3, 0.4]} position={[0.2, 8.7, 1.2]} color={RUST} />
      {/* hook and its cable, hanging over the open end */}
      <B args={[0.06, 3.2, 0.06]} position={[5.4, 6.9, 1.2]} color={METAL_DK} />
      <B args={[0.5, 0.4, 0.5]} position={[5.4, 5.1, 1.2]} color={METAL} />

      {/* the services it broke into: three lit workshops facing the road */}
      {shops.map((sx, i) => (
        <group key={sx} position={[sx, 0, 5.6]}>
          <B args={[4, 0.3, 3.6]} position={[0, 0.15, 0]} color={STONE_DK} />
          <B args={[3.6, 2.7, 3.2]} position={[0, 1.65, 0]} color={i === 1 ? "#7d7468" : STONE} />
          <B args={[3.9, 0.22, 3.5]} position={[0, 3.1, 0]} color={ROOF} />
          <B args={[3.8, 0.14, 3.4]} position={[0, 3.27, 0]} color={SNOW} roughness={0.95} />
          {/* door + window, both lit from inside */}
          <B args={[0.9, 1.6, 0.1]} position={[0, 1.1, 1.62]} color={TIMBER_DK} />
          <GlowPane position={[0, 1.1, 1.69]} size={[0.72, 1.4]} max={0.85} />
          <B args={[0.9, 0.7, 0.08]} position={[1.2, 2.1, 1.62]} color={TIMBER_DK} />
          <GlowPane position={[1.2, 2.1, 1.68]} size={[0.76, 0.58]} max={0.8} />
        </group>
      ))}

      {/* conduits still carrying traffic from the hall out to each service */}
      {shops.map((sx) => (
        <group key={`c${sx}`}>
          <B args={[0.22, 0.22, 4.4]} position={[sx, 0.75, 1.8]} color={METAL_DK} />
          <GlowPane
            position={[sx, 0.9, 1.8]}
            rotation={[Math.PI / 2, 0, 0]}
            size={[0.16, 4.2]}
            color={SCREEN}
            max={0.55}
            additive
            always
          />
        </group>
      ))}

      {/* rubble and a stack of salvaged block */}
      <B args={[1.6, 0.5, 1.4]} position={[7.4, 0.25, 3.4]} color={STONE_DK} />
      <B args={[1.2, 0.4, 1.1]} position={[7.6, 0.7, 3.2]} rotation={[0, 0.4, 0]} color={STONE} />
      <B args={[1.4, 0.3, 1.2]} position={[-7.4, 0.15, 3.6]} rotation={[0, 0.2, 0]} color={STONE} />
    </group>
  );
}

// --- 2. The Forecast Mill — predictive analytics -------------------------------
// History rides up the conveyor, gets weighed inside, and leaves as labelled
// crates on the loading table. A paddle wheel turns on the flank.
function Mill() {
  const wheel = useRef<THREE.Group>(null);
  const belt = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    if (wheel.current) wheel.current.rotation.x += d * 0.55;
    if (belt.current) {
      // Crates ride up the ramp and loop back to the bottom.
      belt.current.children.forEach((c) => {
        c.position.x += d * 0.85;
        c.position.y += d * 0.42;
        if (c.position.x > 3.4) {
          c.position.x = -3.4;
          c.position.y = 0.55;
        }
      });
    }
  });
  return (
    <group>
      {/* mill house */}
      <B args={[6.6, 0.4, 5.4]} position={[0, 0.2, -1]} color={STONE_DK} />
      <B args={[6, 4.2, 4.8]} position={[0, 2.5, -1]} color={STONE} />
      {/* pitched roof */}
      <B args={[3.7, 0.18, 5.2]} position={[-1.6, 5.3, -1]} rotation={[0, 0, 0.46]} color={ROOF} />
      <B args={[3.7, 0.18, 5.2]} position={[1.6, 5.3, -1]} rotation={[0, 0, -0.46]} color={ROOF} />
      <B args={[3.5, 0.12, 5]} position={[-1.57, 5.42, -1]} rotation={[0, 0, 0.46]} color={SNOW} roughness={0.95} />
      <B args={[3.5, 0.12, 5]} position={[1.57, 5.42, -1]} rotation={[0, 0, -0.46]} color={SNOW} roughness={0.95} />
      <B args={[0.4, 0.2, 5.3]} position={[0, 6.16, -1]} color={TIMBER_DK} />

      {/* lit gable window + door onto the loading table */}
      <GlowPane position={[0, 4.5, 1.42]} size={[1.1, 0.8]} max={0.85} />
      <B args={[1.3, 2.2, 0.1]} position={[0, 1.3, 1.42]} color={TIMBER_DK} />
      <GlowPane position={[0, 1.35, 1.49]} size={[1.05, 1.9]} max={0.8} />

      {/* intake conveyor climbing the west flank */}
      <group position={[-5.4, 0.9, 0.6]} rotation={[0, 0, 0.46]}>
        <B args={[7.4, 0.16, 1.3]} position={[0, 0, 0]} color={TIMBER} />
        <B args={[7.4, 0.08, 0.12]} position={[0, 0.18, 0.62]} color={METAL_DK} />
        <B args={[7.4, 0.08, 0.12]} position={[0, 0.18, -0.62]} color={METAL_DK} />
      </group>
      {[-7.4, -5.2, -3].map((lx, i) => (
        <B key={lx} args={[0.14, 1 + i * 0.9, 0.14]} position={[lx, (1 + i * 0.9) / 2, 0.6]} color={METAL} />
      ))}
      {/* crates riding the belt (parented so one useFrame moves them all) */}
      <group ref={belt} position={[-5.4, 0.9, 0.6]}>
        {[-3.4, -1.7, 0, 1.7].map((cx, i) => (
          <mesh key={i} position={[cx, 0.55 + (cx + 3.4) * 0.49, 0]} castShadow frustumCulled={false}>
            <boxGeometry args={[0.7, 0.6, 0.7]} />
            <meshStandardMaterial color={CRATE} roughness={0.9} flatShading />
          </mesh>
        ))}
      </group>

      {/* paddle wheel on the east flank */}
      <group ref={wheel} position={[3.6, 2.2, -1]}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <B
            key={i}
            args={[0.5, 2.9, 0.16]}
            position={[0, 0, 0]}
            rotation={[(i * Math.PI) / 3, Math.PI / 2, 0]}
            color={TIMBER}
          />
        ))}
        <mesh rotation={[0, 0, Math.PI / 2]} frustumCulled={false}>
          <cylinderGeometry args={[0.24, 0.24, 1.1, 10]} />
          <meshStandardMaterial color={METAL_DK} roughness={0.8} flatShading />
        </mesh>
      </group>

      {/* the output: sorted, labelled crates on the loading table */}
      <B args={[4.6, 0.5, 2.2]} position={[0, 0.25, 3.4]} color={TIMBER_DK} />
      {[-1.5, 0, 1.5].map((cx, i) => (
        <group key={cx}>
          <B args={[1.05, 1.05, 1.05]} position={[cx, 1.03, 3.4]} color={CRATE} />
          <GlowPane
            position={[cx, 1.03, 3.94]}
            size={[0.66, 0.34]}
            color={i === 1 ? SCREEN_AMBER : SCREEN}
            max={0.75}
            additive
            always
          />
        </group>
      ))}
    </group>
  );
}

// --- 3. The Watchtower — search & indexing -------------------------------------
// A timber lookout with a beam that sweeps the dark: the thing that finds what
// you're after before you've finished asking.
function Watchtower() {
  const beam = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (beam.current) beam.current.rotation.y += Math.min(dt, 0.05) * 0.5;
  });
  const legs: [number, number][] = [
    [-1.7, -1.7],
    [1.7, -1.7],
    [-1.7, 1.7],
    [1.7, 1.7],
  ];
  return (
    <group>
      {/* footings + four battered legs leaning in as they rise */}
      {legs.map(([lx, lz], i) => (
        <group key={i}>
          <B args={[0.8, 0.4, 0.8]} position={[lx, 0.2, lz]} color={STONE_DK} />
          <B
            args={[0.26, 9.2, 0.26]}
            position={[lx * 0.72, 4.6, lz * 0.72]}
            rotation={[lz > 0 ? 0.075 : -0.075, 0, lx > 0 ? -0.075 : 0.075]}
            color={TIMBER}
          />
        </group>
      ))}
      {/* cross bracing at two levels */}
      {[2.8, 5.8].map((by) => (
        <group key={by}>
          <B args={[3.4, 0.14, 0.14]} position={[0, by, -1.4]} color={TIMBER_DK} />
          <B args={[3.4, 0.14, 0.14]} position={[0, by, 1.4]} color={TIMBER_DK} />
          <B args={[0.14, 0.14, 3.4]} position={[-1.4, by, 0]} color={TIMBER_DK} />
          <B args={[0.14, 0.14, 3.4]} position={[1.4, by, 0]} color={TIMBER_DK} />
          <B args={[3.9, 0.1, 0.1]} position={[0, by + 0.75, -1.4]} rotation={[0, 0, 0.42]} color={TIMBER_DK} />
          <B args={[3.9, 0.1, 0.1]} position={[0, by + 0.75, 1.4]} rotation={[0, 0, -0.42]} color={TIMBER_DK} />
        </group>
      ))}

      {/* ladder up the road-facing side */}
      {Array.from({ length: 11 }, (_, i) => (
        <B key={i} args={[1, 0.09, 0.09]} position={[0, 0.85 + i * 0.78, 1.55]} color={TIMBER_DK} />
      ))}

      {/* the cabin: deck, walls, windows all round, pitched snow roof */}
      <B args={[4.2, 0.24, 4.2]} position={[0, 8.7, 0]} color={TIMBER_DK} />
      <B args={[3.5, 2.1, 3.5]} position={[0, 9.9, 0]} color={TIMBER} />
      <B args={[2.4, 0.16, 4.4]} position={[-1.05, 11.3, 0]} rotation={[0, 0, 0.5]} color={ROOF} />
      <B args={[2.4, 0.16, 4.4]} position={[1.05, 11.3, 0]} rotation={[0, 0, -0.5]} color={ROOF} />
      <B args={[2.25, 0.1, 4.2]} position={[-1.03, 11.4, 0]} rotation={[0, 0, 0.5]} color={SNOW} roughness={0.95} />
      <B args={[2.25, 0.1, 4.2]} position={[1.03, 11.4, 0]} rotation={[0, 0, -0.5]} color={SNOW} roughness={0.95} />
      {/* a lit window on each face */}
      {[0, 1, 2, 3].map((i) => (
        <GlowPane
          key={i}
          position={[
            i === 1 ? 1.78 : i === 3 ? -1.78 : 0,
            9.95,
            i === 0 ? 1.78 : i === 2 ? -1.78 : 0,
          ]}
          rotation={[0, (i * Math.PI) / 2, 0]}
          size={[2.5, 1.2]}
          max={0.9}
        />
      ))}
      {/* railing round the deck */}
      {([-1, 1] as const).map((s) => (
        <group key={s}>
          <B args={[4.2, 0.09, 0.09]} position={[0, 9.3, s * 2.05]} color={TIMBER_DK} />
          <B args={[0.09, 0.09, 4.2]} position={[s * 2.05, 9.3, 0]} color={TIMBER_DK} />
        </group>
      ))}

      {/* the sweep: a long soft beam turning above the cabin */}
      <group ref={beam} position={[0, 11.9, 0]}>
        <mesh frustumCulled={false}>
          <sphereGeometry args={[0.42, 12, 10]} />
          <meshStandardMaterial
            color={SCREEN_AMBER}
            emissive={SCREEN_AMBER}
            emissiveIntensity={1.4}
            roughness={0.4}
            toneMapped={false}
          />
        </mesh>
        <GlowPane
          position={[0, 0, 7]}
          size={[1.5, 0.5]}
          color={SCREEN_AMBER}
          max={0.42}
          additive
          always
        />
        <GlowPane
          position={[0, 0, 3.6]}
          size={[0.9, 0.42]}
          color={SCREEN_AMBER}
          max={0.5}
          additive
          always
        />
      </group>
    </group>
  );
}

// --- 4. The Depot — build, test, ship, on a loop --------------------------------
// An open-fronted shed over a loading dock. Crates come off the line, get
// stamped, and go straight out — the pipeline as a place.
function Depot() {
  const line = useRef<THREE.Group>(null);
  const stamp = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    t.current += d;
    if (line.current) {
      line.current.children.forEach((c) => {
        c.position.x += d * 1.1;
        if (c.position.x > 4.6) c.position.x = -4.6;
      });
    }
    // The press drops as each crate passes under it.
    if (stamp.current) {
      const phase = (t.current * 1.1) % 2.09;
      stamp.current.position.y = 2.5 - Math.max(0, 0.55 - Math.abs(phase - 1) * 1.6);
    }
  });
  return (
    <group>
      {/* shed: back wall, flanks, roof carried on posts at the open front */}
      <B args={[11.4, 0.4, 6.4]} position={[0, 0.2, -1]} color={STONE_DK} />
      <B args={[11, 4, 0.4]} position={[0, 2.4, -3.9]} color={STONE} />
      <B args={[0.4, 4, 5.8]} position={[-5.3, 2.4, -1]} color={STONE} />
      <B args={[0.4, 4, 5.8]} position={[5.3, 2.4, -1]} color={STONE} />
      {[-3.4, 0, 3.4].map((px) => (
        <B key={px} args={[0.3, 4, 0.3]} position={[px, 2.4, 1.75]} color={TIMBER} />
      ))}
      <B args={[11.8, 0.3, 6.6]} position={[0, 4.55, -1]} color={ROOF} />
      <B args={[11.6, 0.16, 6.4]} position={[0, 4.78, -1]} color={SNOW} roughness={0.95} />
      {/* warm work-light under the roof */}
      <GlowPane
        position={[0, 4.3, -1]}
        rotation={[Math.PI / 2, 0, 0]}
        size={[10.4, 5.6]}
        color="#ffe6b0"
        max={0.42}
        additive
      />

      {/* the line: a belt across the shed with crates moving along it */}
      <B args={[10.4, 0.2, 1.4]} position={[0, 1.5, -1.4]} color={METAL_DK} />
      {[-4.6, -2.3, 0, 2.3, 4.6].map((lx) => (
        <B key={lx} args={[0.16, 1.4, 0.16]} position={[lx, 0.75, -1.4]} color={METAL} />
      ))}
      <group ref={line} position={[0, 2.05, -1.4]}>
        {[-4.6, -2.5, -0.4, 1.7, 3.8].map((cx, i) => (
          <mesh key={i} position={[cx, 0, 0]} castShadow frustumCulled={false}>
            <boxGeometry args={[0.9, 0.9, 0.9]} />
            <meshStandardMaterial color={i % 2 ? CRATE : "#6b4a2f"} roughness={0.9} flatShading />
          </mesh>
        ))}
      </group>

      {/* the press that stamps each one as it goes past */}
      <B args={[0.3, 2.4, 0.3]} position={[-1.5, 3.2, -2.3]} color={METAL} />
      <B args={[1.9, 0.24, 0.24]} position={[-0.75, 4.3, -2.3]} color={METAL} />
      <mesh ref={stamp} position={[0, 2.5, -2]} castShadow frustumCulled={false}>
        <boxGeometry args={[0.7, 0.8, 0.7]} />
        <meshStandardMaterial color={RUST} roughness={0.7} flatShading />
      </mesh>

      {/* the dock: platform, edge kerb, steps, and outbound stacks */}
      <B args={[11, 0.9, 2.6]} position={[0, 0.45, 3.2]} color={STONE} />
      <B args={[11.2, 0.16, 0.3]} position={[0, 0.94, 4.4]} color={RUST} />
      <B args={[2.4, 0.3, 0.7]} position={[4.2, 0.15, 4.9]} color={STONE_DK} />
      {[
        [-4.2, 1.25],
        [-4.2, 2.05],
        [-3.1, 1.25],
        [3.9, 1.25],
      ].map(([cx, cy], i) => (
        <B key={i} args={[0.95, 0.85, 0.95]} position={[cx, cy, 3.3]} color={i === 1 ? "#6b4a2f" : CRATE} />
      ))}
      {/* green light on the dock — the deploy is clear to go */}
      <B args={[0.24, 1.5, 0.24]} position={[5, 1.65, 4.2]} color={METAL_DK} />
      <GlowPane
        position={[5, 2.3, 4.36]}
        size={[0.5, 0.5]}
        color={SCREEN}
        max={0.9}
        additive
        always
      />
    </group>
  );
}

// --- 5. The Signal Station — observability --------------------------------------
// A lattice mast on the high ground with instrument faces and a slow sweep,
// watching the valley so failures announce themselves.
function SignalStation() {
  const sweep = useRef<THREE.Group>(null);
  const dish = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    if (sweep.current) sweep.current.rotation.y += d * 0.85;
    if (dish.current) dish.current.rotation.y = Math.sin(performance.now() * 0.00018) * 0.7;
  });
  const legs: [number, number][] = [
    [-1.3, -1.3],
    [1.3, -1.3],
    [-1.3, 1.3],
    [1.3, 1.3],
  ];
  return (
    <group>
      {/* concrete base + four steel legs converging toward the platform */}
      <B args={[4.4, 0.5, 4.4]} position={[0, 0.25, 0]} color={STONE_DK} />
      {legs.map(([lx, lz], i) => (
        <B
          key={i}
          args={[0.22, 9.4, 0.22]}
          position={[lx * 0.62, 4.9, lz * 0.62]}
          rotation={[lz > 0 ? 0.09 : -0.09, 0, lx > 0 ? -0.09 : 0.09]}
          color={METAL}
        />
      ))}
      {/* X-braced bays */}
      {[2.2, 4.4, 6.6, 8.4].map((by, k) => {
        const s = 1.25 - k * 0.19;
        return (
          <group key={by}>
            <B args={[s * 2.1, 0.1, 0.1]} position={[0, by, -s]} color={METAL_DK} />
            <B args={[s * 2.1, 0.1, 0.1]} position={[0, by, s]} color={METAL_DK} />
            <B args={[0.1, 0.1, s * 2.1]} position={[-s, by, 0]} color={METAL_DK} />
            <B args={[0.1, 0.1, s * 2.1]} position={[s, by, 0]} color={METAL_DK} />
            <B args={[s * 2.6, 0.07, 0.07]} position={[0, by + 0.55, s]} rotation={[0, 0, 0.5]} color={METAL_DK} />
            <B args={[s * 2.6, 0.07, 0.07]} position={[0, by + 0.55, -s]} rotation={[0, 0, -0.5]} color={METAL_DK} />
          </group>
        );
      })}

      {/* instrument platform: three dashboard faces reading out over the valley */}
      <B args={[3, 0.22, 3]} position={[0, 9.3, 0]} color={METAL_DK} />
      {[0, 1, 2].map((i) => {
        const a = (i * Math.PI * 2) / 3 + Math.PI / 6;
        const px = Math.sin(a) * 1.35;
        const pz = Math.cos(a) * 1.35;
        return (
          <group key={i} position={[px, 10.1, pz]} rotation={[0, a, 0]}>
            <B args={[1.7, 1.2, 0.12]} position={[0, 0, 0]} color="#22262d" />
            <GlowPane
              position={[0, 0, 0.09]}
              size={[1.5, 1]}
              color={i === 1 ? SCREEN_AMBER : SCREEN}
              max={0.8}
              additive
              always
          />
          </group>
        );
      })}

      {/* the sweep bar, turning above the instruments */}
      <group ref={sweep} position={[0, 11.1, 0]}>
        <B args={[3.4, 0.12, 0.12]} position={[0, 0, 0]} color={RUST} />
        <GlowPane position={[1.5, 0, 0]} size={[1.4, 0.34]} color={SCREEN} max={0.6} additive always />
      </group>
      {/* a small dish that pans slowly */}
      <group ref={dish} position={[0, 11.8, 0]}>
        <mesh rotation={[Math.PI / 2.6, 0, 0]} frustumCulled={false}>
          <coneGeometry args={[0.75, 0.5, 12, 1, true]} />
          <meshStandardMaterial color="#c9ced6" roughness={0.6} flatShading side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* equipment hut at the foot, facing the road */}
      <B args={[3.4, 2.4, 3]} position={[0, 1.2, 3.6]} color={STONE} />
      <B args={[3.7, 0.24, 3.3]} position={[0, 2.5, 3.6]} color={ROOF} />
      <B args={[3.6, 0.14, 3.2]} position={[0, 2.68, 3.6]} color={SNOW} roughness={0.95} />
      <B args={[0.95, 1.7, 0.1]} position={[0, 0.85, 5.13]} color={TIMBER_DK} />
      <GlowPane position={[0, 0.85, 5.2]} size={[0.78, 1.5]} max={0.85} />
      <GlowPane position={[1.1, 1.7, 5.16]} size={[0.6, 0.4]} color={SCREEN} max={0.7} additive always />
    </group>
  );
}

// --- 6. The Exchange — multi-tenant consolidation --------------------------------
// Five separate codebases folded into one platform: a single long hall with five
// front doors, and the empty foundations of what it replaced still in the snow.
function Exchange() {
  const doors = [-4.6, -2.3, 0, 2.3, 4.6];
  const doorColors = ["#7c4a3a", "#4a5f7c", "#5f7c4a", "#7c6a3a", "#6a4a7c"];
  return (
    <group>
      {/* one hall, five doors */}
      <B args={[12.6, 0.45, 6]} position={[0, 0.22, -0.6]} color={STONE_DK} />
      <B args={[12, 3.6, 5.4]} position={[0, 2.05, -0.6]} color={STONE} />
      <B args={[12.4, 0.28, 5.8]} position={[0, 3.98, -0.6]} color={ROOF} />
      <B args={[12.2, 0.16, 5.6]} position={[0, 4.2, -0.6]} color={SNOW} roughness={0.95} />
      {/* a shallow ridge so it doesn't read as a shipping container */}
      <B args={[12.2, 0.5, 1.4]} position={[0, 4.5, -0.6]} color={ROOF} />
      <B args={[12, 0.12, 1.3]} position={[0, 4.78, -0.6]} color={SNOW} roughness={0.95} />

      {doors.map((dx, i) => (
        <group key={dx} position={[dx, 0, 2.13]}>
          {/* each tenant keeps its own front door and its own house colour */}
          <B args={[1.5, 2.5, 0.16]} position={[0, 1.25, 0]} color={STONE_DK} />
          <B args={[1.1, 2.1, 0.1]} position={[0, 1.05, 0.1]} color={doorColors[i]} />
          <GlowPane position={[0, 2.62, 0.12]} size={[1.1, 0.36]} max={0.85} />
          {/* step */}
          <B args={[1.7, 0.18, 0.7]} position={[0, 0.09, 0.45]} color={STONE_DK} />
        </group>
      ))}
      {/* one shared roofline light over the middle door */}
      <GlowPane position={[0, 3.7, 2.2]} size={[3, 0.3]} color="#ffe6b0" max={0.4} additive />

      {/* the foundations of the buildings it replaced — low slabs in the snow */}
      {[
        [-8.3, 3.4, 0.3],
        [-7.6, 6.6, -0.5],
        [8.1, 3.1, -0.2],
        [7.4, 6.5, 0.6],
      ].map(([fx, fz, rot], i) => (
        <group key={i} position={[fx, 0, fz]} rotation={[0, rot, 0]}>
          <B args={[2.8, 0.26, 2.8]} position={[0, 0.13, 0]} color={STONE_DK} />
          <B args={[2.8, 0.12, 0.3]} position={[0, 0.32, -1.25]} color={STONE} />
          <B args={[0.3, 0.12, 2.8]} position={[-1.25, 0.32, 0]} color={STONE} />
        </group>
      ))}
    </group>
  );
}

// --- the plaque ------------------------------------------------------------------
// A board on a post outside each landmark. Lights up as you get near (checked
// against the shared avatarPos each frame and written straight to the DOM node —
// no React state, so walking past costs nothing) and opens the full card when
// clicked.
function Plaque({
  title,
  project,
  panelId,
  z,
  fx,
  fz,
  onPick,
  visible = true,
}: {
  title: string;
  project: string;
  panelId: string;
  z: number;
  fx: number;
  fz: number;
  onPick: (panelId: string, focus: DisplayFocus) => void;
  visible?: boolean;
}) {
  const near = useRef(false);
  const [isNear, setIsNear] = useState(false);
  const world = useRef(new THREE.Vector3());
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered, "pointer", "auto");

  const choose = () => {
    group.current?.getWorldPosition(world.current);
    onPick(panelId, {
      id: panelId,
      x: world.current.x,
      y: world.current.y + 1.72,
      z: world.current.z,
      fx,
      fz,
    });
  };

  useFrame(() => {
    if (!group.current) return;
    group.current.getWorldPosition(world.current);
    const d = Math.hypot(avatarPos.x - world.current.x, avatarPos.z - world.current.z);
    const isNear = d < NEAR_M;
    if (isNear !== near.current) {
      near.current = isNear;
      setIsNear(isNear);
    }
  });

  return (
    <group ref={group} position={[0, 0, z]} visible={visible}>
      <mesh position={[0, 0.85, 0]} castShadow frustumCulled={false}>
        <boxGeometry args={[0.12, 1.7, 0.12]} />
        <meshStandardMaterial color={TIMBER_DK} roughness={1} flatShading />
      </mesh>
      <Billboard
        position={[0, 1.72, 0.03]}
        follow
        lockX
        lockZ
        frustumCulled={false}
      >
        <group
          scale={isNear || hovered ? 1.05 : 1}
          onClick={(event) => { event.stopPropagation(); choose(); }}
          onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
          onPointerOut={() => setHovered(false)}
        >
          <mesh castShadow frustumCulled={false}>
            <boxGeometry args={[2.35, 0.88, 0.08]} />
            <meshStandardMaterial color="#020705" emissive="#063719" emissiveIntensity={isNear || hovered ? 0.72 : 0.4} metalness={0.68} roughness={0.35} />
          </mesh>
          <MatrixSignFace
            width={2.35}
            height={0.88}
            title={title}
            subtitle={project}
            action="CLICK BOARD TO OPEN"
            system="PROJECT_ACCESS"
            active={isNear || hovered}
          />
        </group>
      </Billboard>
    </group>
  );
}

function Structure({ kind }: { kind: Exclude<ProjectStructure, null> }) {
  switch (kind) {
    case "foundry":
      return <Foundry />;
    case "mill":
      return <Mill />;
    case "watchtower":
      return <Watchtower />;
    case "depot":
      return <Depot />;
    case "signal":
      return <SignalStation />;
    case "exchange":
      return <Exchange />;
  }
}

export default function Landmarks({
  onPick,
  showPlaques = true,
}: {
  onPick: (panelId: string, focus: DisplayFocus) => void;
  showPlaques?: boolean;
}) {
  return (
    <group>
      {PROJECT_SITES.map((s) => (
        <group
          key={s.id}
          position={[s.x, height(s.x, s.z) - 0.05, s.z]}
          rotation={[0, s.yaw, 0]}
        >
          {s.structure && <Structure kind={s.structure} />}
          {/* The Reading Room hangs on the library, which is already standing —
              its site IS the plaque spot, so the board sits at the origin. */}
          <Plaque
            visible={showPlaques}
            title={s.title}
            project={s.project}
            panelId={projectPanelId(s.id)}
            z={s.plaqueZ ?? (s.structure ? s.clearR * 0.62 : 0)}
            fx={s.fx}
            fz={s.fz}
            onPick={onPick}
            />
        </group>
      ))}
    </group>
  );
}
