"use client";

import { useMemo } from "react";
import { BRIDGE } from "@/lib/journey/config";
import { walkHeight, POND_WATER_Y } from "@/lib/journey/terrain";

// THE POND BRIDGE — the timber crossing that carries the Experience road over
// the pond (the user's "pond with bridge"). Everything is derived from the
// shared BRIDGE spec: the deck top follows terrain.walkHeight() exactly, which
// is the same profile the avatar's feet, the path ribbon and the camera clamp
// read — so the structure and the walkable surface can never drift apart.
// Simple flat-shaded boxes/cylinders to match the low-poly world; one material
// per part class.

const TIMBER = "#6f5233"; // weathered deck planks
const TIMBER_DARK = "#57402a"; // rails / piles
const SNOWCAP = "#e8eef6"; // snow settled on the rail tops

export default function Bridge() {
  const parts = useMemo(() => {
    const ex = BRIDGE.bx - BRIDGE.ax;
    const ez = BRIDGE.bz - BRIDGE.az;
    const L = Math.hypot(ex, ez);
    const ux = ex / L;
    const uz = ez / L;
    const px = -uz; // deck's lateral direction
    const pz = ux;
    const yaw = Math.atan2(ux, uz);

    // Sample the deck profile at s (metres along the chord), on the centreline.
    const deckY = (s: number) =>
      walkHeight(BRIDGE.ax + ux * s, BRIDGE.az + uz * s);

    // Deck: segments that follow the arched profile (each pitched between its
    // two profile samples). Slightly wider than the walked ribbon so the plank
    // edges read past the snow tread.
    const SEGS = 12;
    const segLen = L / SEGS;
    const deck: { pos: [number, number, number]; ry: number; rx: number; len: number }[] = [];
    for (let i = 0; i < SEGS; i++) {
      const s0 = i * segLen;
      const s1 = s0 + segLen;
      const y0 = deckY(s0);
      const y1 = deckY(s1);
      const sm = (s0 + s1) / 2;
      deck.push({
        pos: [BRIDGE.ax + ux * sm, (y0 + y1) / 2 - 0.07, BRIDGE.az + uz * sm],
        ry: yaw,
        rx: Math.atan2(y0 - y1, segLen), // pitch to follow the arch
        len: segLen + 0.05,
      });
    }

    // Rails: posts every segment joint + two horizontal rails per side, each
    // rail segment following the deck pitch. Post feet sit ON the deck.
    const posts: { pos: [number, number, number] }[] = [];
    const rails: { pos: [number, number, number]; ry: number; rx: number; len: number; y: number }[] = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i <= SEGS; i++) {
        const s = i * segLen;
        posts.push({
          pos: [
            BRIDGE.ax + ux * s + px * BRIDGE.halfW * side,
            deckY(s) + 0.5,
            BRIDGE.az + uz * s + pz * BRIDGE.halfW * side,
          ],
        });
      }
      for (let i = 0; i < SEGS; i++) {
        const s0 = i * segLen;
        const s1 = s0 + segLen;
        const y0 = deckY(s0);
        const y1 = deckY(s1);
        const sm = (s0 + s1) / 2;
        for (const railY of [0.55, 0.95]) {
          rails.push({
            pos: [
              BRIDGE.ax + ux * sm + px * BRIDGE.halfW * side,
              (y0 + y1) / 2 + railY,
              BRIDGE.az + uz * sm + pz * BRIDGE.halfW * side,
            ],
            ry: yaw,
            rx: Math.atan2(y0 - y1, segLen),
            len: segLen + 0.08,
            y: railY,
          });
        }
      }
    }

    // Piles: paired timber legs from the deck down into the water, at the
    // third-points of the span (well clear of the curling sheet to the south).
    const piles: { pos: [number, number, number]; h: number }[] = [];
    for (const f of [0.25, 0.5, 0.75]) {
      const s = L * f;
      const top = deckY(s) - 0.1;
      const bottom = POND_WATER_Y - 1.4; // into the basin
      for (const side of [-1, 1]) {
        piles.push({
          pos: [
            BRIDGE.ax + ux * s + px * (BRIDGE.halfW - 0.35) * side,
            (top + bottom) / 2,
            BRIDGE.az + uz * s + pz * (BRIDGE.halfW - 0.35) * side,
          ],
          h: top - bottom,
        });
      }
    }

    // Abutments: a low timber block at each end where the road meets the deck.
    const abutments: { pos: [number, number, number]; ry: number }[] = [
      { pos: [BRIDGE.ax - ux * 0.6, deckY(0) - 0.42, BRIDGE.az - uz * 0.6], ry: yaw },
      { pos: [BRIDGE.bx + ux * 0.6, deckY(L) - 0.42, BRIDGE.bz + uz * 0.6], ry: yaw },
    ];

    return { deck, posts, rails, piles, abutments, yaw, W: BRIDGE.halfW * 2 + 0.5 };
  }, []);

  return (
    <group>
      {parts.deck.map((d, i) => (
        <mesh key={`d${i}`} position={d.pos} rotation={[d.rx, d.ry, 0, "YXZ"]} castShadow receiveShadow>
          <boxGeometry args={[parts.W, 0.16, d.len]} />
          <meshStandardMaterial color={TIMBER} roughness={0.95} metalness={0} flatShading />
        </mesh>
      ))}

      {parts.posts.map((p, i) => (
        <mesh key={`p${i}`} position={p.pos} castShadow>
          <boxGeometry args={[0.14, 1.06, 0.14]} />
          <meshStandardMaterial color={TIMBER_DARK} roughness={1} metalness={0} flatShading />
        </mesh>
      ))}
      {/* snow caps on the posts */}
      {parts.posts.map((p, i) => (
        <mesh key={`pc${i}`} position={[p.pos[0], p.pos[1] + 0.56, p.pos[2]]}>
          <boxGeometry args={[0.17, 0.06, 0.17]} />
          <meshStandardMaterial color={SNOWCAP} roughness={0.9} metalness={0} flatShading />
        </mesh>
      ))}

      {parts.rails.map((r, i) => (
        <mesh key={`r${i}`} position={r.pos} rotation={[r.rx, r.ry, 0, "YXZ"]} castShadow>
          <boxGeometry args={[0.09, r.y > 0.7 ? 0.12 : 0.09, r.len]} />
          <meshStandardMaterial color={TIMBER_DARK} roughness={1} metalness={0} flatShading />
        </mesh>
      ))}

      {parts.piles.map((p, i) => (
        <mesh key={`l${i}`} position={p.pos} castShadow>
          <cylinderGeometry args={[0.16, 0.19, p.h, 8]} />
          <meshStandardMaterial color={TIMBER_DARK} roughness={1} metalness={0} flatShading />
        </mesh>
      ))}

      {parts.abutments.map((a, i) => (
        <mesh key={`a${i}`} position={a.pos} rotation={[0, a.ry, 0]} castShadow receiveShadow>
          <boxGeometry args={[parts.W + 0.7, 0.55, 1.4]} />
          <meshStandardMaterial color={TIMBER_DARK} roughness={1} metalness={0} flatShading />
        </mesh>
      ))}
    </group>
  );
}
