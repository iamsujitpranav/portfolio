"use client";

import { useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { POND, CURL_SHEET } from "@/lib/journey/config";
import { POND_WATER_Y } from "@/lib/journey/terrain";
import { pushToast, celebrate, game } from "@/lib/journey/game";

// Curling on the frozen pond. The sheet lives on the pond's SOUTH lobe — the
// bridge crosses the north half, so the hack (throwing spot) and the house are
// fixed spots from the shared CURL_SHEET spec, both a stone's throw from the
// bridge abutment. Click anywhere on the ice and a stone slides from the hack
// toward that spot, decelerating and curling as it goes. Three stones to an
// end, then the end is scored on where the stones actually finished.
//
// Stones collide with each other, which is what makes it a game rather than a
// dexterity test: a stone parked on the button is a target for the next one, and
// two stones can never end up occupying the same patch of ice.

const STONES_PER_END = 3;
const ICE_Y = POND_WATER_Y + 0.02; // painted rings sit just proud of the ice
const STONE_R = 0.34;
const FRICTION = 0.62; // m/s² — a long, slow, watchable slide (~5 s end to end)
const SPEED_ERROR = 0.07; // ±7% on the weight of the throw
const CURL = 0.16; // m/s² of sideways drift, the "curl" of the stone
const REST = 0.85; // collision restitution — granite on granite, barely damped
const STOP_V = 0.02; // below this the stone is settled
const RING_R = [1.0, 2.2, 3.6]; // button, inner, outer — must match SCORES
const SCORES = [10, 6, 3];

type Stone = { x: number; z: number; vx: number; vz: number; curl: number; spin: number };

const moving = (s: Stone) => Math.hypot(s.vx, s.vz) > STOP_V;

export default function Curling() {
  // The hack (throwing spot) — a fixed spot on the ice near the bridge's west
  // abutment, so the player standing at the Pond Bridge is beside the stone
  // they're throwing. The house sits east along the south lobe.
  const place = { hackX: CURL_SHEET.hackX, hackZ: CURL_SHEET.hackZ };

  const stones = useRef<Stone[]>([]);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const scored = useRef(false);
  const [count, setCount] = useState(0); // drives how many stone meshes exist
  const [hint, setHint] = useState("click the ice to throw");

  const throwStone = (tx: number, tz: number) => {
    if (stones.current.length >= STONES_PER_END) return;
    if (stones.current.some(moving)) return; // one stone in motion at a time

    let dx = tx - place.hackX;
    let dz = tz - place.hackZ;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) return;
    dx /= dist;
    dz /= dist;

    // Weight the throw to stop at the aim point: with constant deceleration,
    // v = sqrt(2·a·d). Then bias it slightly so no two throws are identical.
    const speed =
      Math.sqrt(2 * FRICTION * dist) * (1 + (Math.random() * 2 - 1) * SPEED_ERROR);
    stones.current.push({
      x: place.hackX,
      z: place.hackZ,
      vx: dx * speed,
      vz: dz * speed,
      curl: (Math.random() < 0.5 ? -1 : 1) * CURL,
      spin: 0,
    });
    setCount(stones.current.length);
    setHint("sliding…");
  };

  const scoreEnd = () => {
    // `total` is only used to judge how good the end was (does it deserve a
    // celebration dance) — nothing is awarded. The visitor is told the result in
    // curling's own terms: how many stones finished in the house.
    let total = 0;
    let best = Infinity;
    let inHouse = 0;
    for (const s of stones.current) {
      const d = Math.hypot(s.x - CURL_SHEET.buttonX, s.z - CURL_SHEET.buttonZ);
      best = Math.min(best, d);
      const idx = RING_R.findIndex((r) => d <= r);
      if (idx >= 0) {
        total += SCORES[idx];
        inHouse++;
      }
    }
    const stoneWord = inHouse === 1 ? "stone" : "stones";
    pushToast(
      inHouse === 0
        ? "All three wide — nothing in the house."
        : best <= RING_R[0]
          ? `On the button! ${inHouse} ${stoneWord} in the house.`
          : `${inHouse} ${stoneWord} in the house.`,
      "board",
    );
    game.curlEndScore = total;
    // A good end is worth a celebration; three on the button is worth the best one.
    if (total >= 18) celebrate(total >= 26);
    window.setTimeout(() => {
      stones.current = [];
      groups.current = [];
      scored.current = false;
      game.curlStones = 0;
      setCount(0);
      setHint("click the ice to throw");
    }, 2200);
  };

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const list = stones.current;

    for (const s of list) {
      const v = Math.hypot(s.vx, s.vz);
      if (v <= STOP_V) {
        s.vx = 0;
        s.vz = 0;
        continue;
      }
      // Friction opposes travel; curl pushes perpendicular to it and fades in as
      // the stone slows, so it bends most as it dies — like the real thing.
      const nx = s.vx / v;
      const nz = s.vz / v;
      const drift = s.curl * (1 - Math.min(1, v / 3));
      s.vx += (-nx * FRICTION + -nz * drift) * dt;
      s.vz += (-nz * FRICTION + nx * drift) * dt;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.spin += v * dt * 1.2;

      // The bank: a stone that reaches the edge is dead where it stops (well
      // outside the rings, so it simply scores nothing).
      const fromCentre = Math.hypot(s.x - POND.x, s.z - POND.z);
      const limit = POND.radius - STONE_R;
      if (fromCentre > limit) {
        const k = limit / fromCentre;
        s.x = POND.x + (s.x - POND.x) * k;
        s.z = POND.z + (s.z - POND.z) * k;
        s.vx = 0;
        s.vz = 0;
      }
    }

    // Stone-on-stone: separate any overlap, then exchange momentum along the
    // contact normal (equal masses, so the impulse just swaps normal velocity).
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = STONE_R * 2;
        if (d >= min || d < 1e-6) continue;
        const nx = dx / d;
        const nz = dz / d;
        const push = (min - d) / 2;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv >= 0) continue; // already separating
        const imp = (-(1 + REST) * rv) / 2;
        a.vx -= imp * nx;
        a.vz -= imp * nz;
        b.vx += imp * nx;
        b.vz += imp * nz;
      }
    }

    // End complete: every stone thrown and everything at rest.
    if (!scored.current && list.length >= STONES_PER_END && !list.some(moving)) {
      scored.current = true;
      game.curlStones = list.length;
      scoreEnd();
    } else if (!scored.current && list.length && !list.some(moving)) {
      const next = list.length + 1;
      if (hint !== `stone ${next} of ${STONES_PER_END}`)
        setHint(`stone ${next} of ${STONES_PER_END}`);
    }

    // Push simulated positions onto the meshes.
    list.forEach((s, i) => {
      const g = groups.current[i];
      if (!g) return;
      g.position.set(s.x, ICE_Y + 0.12, s.z);
      g.rotation.y = s.spin;
    });
  });

  return (
    <group>
      {/* The house: painted target rings on the ice, east end of the sheet. */}
      {RING_R.map((r, i) => (
        <mesh
          key={r}
          position={[CURL_SHEET.buttonX, ICE_Y + 0.005 * (RING_R.length - i), CURL_SHEET.buttonZ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[i === 0 ? 0 : RING_R[i - 1], r, 48]} />
          <meshBasicMaterial
            color={i === 0 ? "#d0463c" : i === 1 ? "#eef4fb" : "#5b8db8"}
            transparent
            opacity={i === 0 ? 0.5 : 0.3}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Click-catcher over the ice — invisible, but it's what you aim with. */}
      <mesh
        position={[POND.x, ICE_Y + 0.03, POND.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          throwStone(e.point.x, e.point.z);
        }}
        onPointerOver={() => (document.body.style.cursor = "crosshair")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <circleGeometry args={[POND.radius - 0.4, 48]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Thrown stones: a granite puck with a bright handle. */}
      {Array.from({ length: count }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el;
          }}
        >
          <mesh castShadow>
            <cylinderGeometry args={[STONE_R, STONE_R * 0.92, 0.22, 20]} />
            <meshStandardMaterial color="#6f7581" roughness={0.6} flatShading />
          </mesh>
          <mesh position={[0, 0.16, 0]}>
            <torusGeometry args={[0.1, 0.03, 8, 16]} />
            <meshStandardMaterial color="#d0463c" roughness={0.5} />
          </mesh>
        </group>
      ))}

      {/* Hack marker + prompt, so the game announces itself from the trail. */}
      <group position={[place.hackX, ICE_Y, place.hackZ]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.34, 0.5, 20]} />
          <meshBasicMaterial
            color="#8fe6ff"
            transparent
            opacity={0.75}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <Html center position={[0, 1.1, 0]} distanceFactor={16} zIndexRange={[20, 0]}>
          <div className="jrnKioskTag" onClick={(e) => e.stopPropagation()}>
            ⟡ Curling — {hint}
          </div>
        </Html>
      </group>
    </group>
  );
}
