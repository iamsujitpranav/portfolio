"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { lerp } from "@/lib/journey/noise";
import { game, pushToast } from "@/lib/journey/game";
import { warp, warpedSince } from "@/lib/journey/warp";
import type { Nav } from "./Avatar";

// Hidden "secrets" strung along the trail — glowing gems that hover just over
// the path. Walking through one collects it (the auto-walk crosses its `u`),
// scores, and surfaces a real résumé fact as a toast, so exploration pays out in
// content rather than trivia. Count is published to the HUD via game.secretsTotal.

// u 0.205 (not 0.14): the tour's 0.13–0.18 stretch is the pond bridge DECK —
// a gem there would hover over open water beside the rails (audited).
export const SECRETS: { u: number; side: 1 | -1; fact: string }[] = [
  { u: 0.205, side: 1, fact: "✦ 12 years shipping production systems" },
  { u: 0.3, side: -1, fact: "✦ Modernized large-scale Rails monoliths — 2× release velocity" },
  { u: 0.44, side: 1, fact: "✦ Builds agentic dev workflows on Claude + MCP" },
  { u: 0.58, side: -1, fact: "✦ Took recommendation engines from prototype to prod" },
  { u: 0.74, side: 1, fact: "✦ Ruby on Rails · Python · FastAPI" },
  { u: 0.94, side: -1, fact: "✦ Open to Staff / Eng-Lead AI roles" },
];
export const SECRET_OFFSET = 1.6;
const FLOAT_Y = 1.95;

function Secret({
  u,
  side,
  fact,
  curve,
  nav,
}: {
  u: number;
  side: 1 | -1;
  fact: string;
  curve: THREE.CatmullRomCurve3;
  nav: Nav;
}) {
  const pos = useMemo(() => {
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    const px = -tan.z;
    const pz = tan.x;
    const l = Math.hypot(px, pz) || 1;
    return [p.x + (px / l) * SECRET_OFFSET * side, p.y + FLOAT_Y, p.z + (pz / l) * SECRET_OFFSET * side] as [
      number,
      number,
      number,
    ];
  }, [curve, u, side]);

  const gem = useRef<THREE.Group>(null);
  const burst = useRef<THREE.Group>(null);
  const burstMat = useRef<THREE.MeshBasicMaterial>(null);
  const st = useRef({ prev: 0, taken: false, burst: 0, t: 0 });
  const warpSeen = useRef({ seq: warp.seq });

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const s = st.current;
    s.t += dt;

    // Idle bob + spin while un-collected.
    if (gem.current && !s.taken) {
      gem.current.rotation.y += dt * 1.4;
      gem.current.position.y = pos[1] + Math.sin(s.t * 2) * 0.14;
    }

    // Collect when the walk crosses this u. A JUMP in the derived spine scalar
    // (rejoining the spine off a scenic loop snaps it across the whole loop
    // span) is a reposition, not a walk past — never a collect. No real frame
    // moves more than ~0.001 of the spine, so 0.03 is a 30× margin. A map warp
    // says so outright, since a short one can land inside that margin.
    const progress = nav.progress;
    const prev = s.prev;
    s.prev = progress;
    const teleported = warpedSince(warpSeen.current) || Math.abs(progress - prev) > 0.03;
    if (!s.taken && !teleported && Math.abs(progress - prev) > 1e-7) {
      const lo = Math.min(prev, progress);
      const hi = Math.max(prev, progress);
      if (lo < u && u <= hi && game.active) {
        s.taken = true;
        s.burst = 0.0001;
        game.secretsFound++;
        pushToast(fact, "secret");
        if (gem.current) gem.current.visible = false;
      }
    }

    // Collect burst — an expanding, fading ring.
    if (s.burst > 0) {
      s.burst += dt;
      const k = s.burst / 0.6;
      if (burst.current) {
        const sc = lerp(0.4, 3.6, k);
        burst.current.scale.setScalar(sc);
      }
      if (burstMat.current) burstMat.current.opacity = Math.max(0, 1 - k) * 0.9;
      if (k >= 1) s.burst = 0;
    } else if (burstMat.current) {
      burstMat.current.opacity = 0;
    }
  });

  return (
    <group position={pos}>
      <group ref={gem}>
        {/* gem — emissive so it blooms on the GPU */}
        <mesh>
          <octahedronGeometry args={[0.34, 0]} />
          <meshStandardMaterial
            color="#ffe9a8"
            emissive="#ffcf5a"
            emissiveIntensity={2.4}
            roughness={0.3}
            metalness={0.1}
            flatShading
          />
        </mesh>
        {/* halo */}
        <mesh>
          <icosahedronGeometry args={[0.6, 0]} />
          <meshBasicMaterial
            color="#ffdf8f"
            transparent
            opacity={0.18}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* collect burst */}
      <group ref={burst} scale={0.4}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.72, 24]} />
          <meshBasicMaterial
            ref={burstMat}
            color="#ffe6a0"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

export default function Collectibles({
  curve,
  nav,
}: {
  curve: THREE.CatmullRomCurve3;
  nav: Nav;
}) {
  useEffect(() => {
    game.secretsTotal = SECRETS.length;
    game.rev++;
  }, []);

  return (
    <group>
      {SECRETS.map((s, i) => (
        <Secret key={i} u={s.u} side={s.side} fact={s.fact} curve={curve} nav={nav} />
      ))}
    </group>
  );
}
