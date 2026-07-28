"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { openModal, type ModalGame } from "@/lib/journey/game";
import { KIOSK_PLACES } from "@/lib/journey/attractions";
import { height } from "@/lib/journey/terrain";

// The game kiosks — little painted boards on posts, each opening one of the DOM
// mini-games via `game.modal` (GameHud is watching it). Tic-tac-toe stands in
// the TOWN SQUARE; stack match waits out on the forest stretch between stops.
// Their board positions live in attractions.ts (KIOSK_PLACES) so the HUD's
// distances/"Go" and the rendered boards can never disagree.

type Spec = {
  which: ModalGame;
  label: string;
  /** Face colour + the little painted motif that hints at the game. */
  tint: string;
};

const KIOSKS: Spec[] = [
  { which: "tictactoe", label: "Play Tic-Tac-Toe", tint: "#e0b64a" },
  { which: "match", label: "Play Stack Match", tint: "#7fc6a8" },
];

function Kiosk({ spec }: { spec: Spec }) {
  const place = useMemo(() => {
    const k = KIOSK_PLACES[spec.which];
    return { pos: [k.x, height(k.x, k.z) + 0.1, k.z] as [number, number, number], yaw: k.yaw };
  }, [spec.which]);

  const glow = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (glow.current) {
      glow.current.emissiveIntensity = 0.5 + 0.4 * Math.sin(clock.elapsedTime * 2.4);
    }
  });

  const open = (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    openModal(spec.which);
  };

  const isTtt = spec.which === "tictactoe";

  return (
    <group
      position={place.pos}
      rotation={[0, place.yaw, 0]}
      onClick={(e) => {
        e.stopPropagation();
        open();
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      {/* post */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 1.4, 8]} />
        <meshStandardMaterial color="#6b4a2f" roughness={0.95} flatShading />
      </mesh>
      {/* board backing */}
      <mesh position={[0, 1.7, 0]} castShadow>
        <boxGeometry args={[1.15, 1.15, 0.1]} />
        <meshStandardMaterial
          ref={glow}
          color="#2c2f38"
          emissive={spec.tint}
          emissiveIntensity={0.6}
          roughness={0.7}
          flatShading
        />
      </mesh>

      {isTtt ? (
        <>
          {/* grid lines */}
          {[-0.19, 0.19].map((o) => (
            <mesh key={`v${o}`} position={[o, 1.7, 0.06]}>
              <boxGeometry args={[0.03, 1.02, 0.02]} />
              <meshStandardMaterial color="#f2ead6" roughness={0.6} />
            </mesh>
          ))}
          {[-0.19, 0.19].map((o) => (
            <mesh key={`h${o}`} position={[0, 1.7 + o, 0.06]}>
              <boxGeometry args={[1.02, 0.03, 0.02]} />
              <meshStandardMaterial color="#f2ead6" roughness={0.6} />
            </mesh>
          ))}
          {/* a couple of painted marks so it reads as tic-tac-toe */}
          <mesh position={[-0.36, 2.06, 0.06]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.24, 0.04, 0.02]} />
            <meshStandardMaterial color="#c85c4a" roughness={0.6} />
          </mesh>
          <mesh position={[-0.36, 2.06, 0.06]} rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.24, 0.04, 0.02]} />
            <meshStandardMaterial color="#c85c4a" roughness={0.6} />
          </mesh>
          <mesh position={[0.36, 1.34, 0.06]}>
            <torusGeometry args={[0.12, 0.025, 8, 20]} />
            <meshStandardMaterial color="#4a86b0" roughness={0.6} />
          </mesh>
        </>
      ) : (
        // Four painted "cards", one turned face-up — reads as a matching game.
        <>
          {[
            [-0.26, 1.96],
            [0.26, 1.96],
            [-0.26, 1.44],
            [0.26, 1.44],
          ].map(([cx, cy], i) => (
            <mesh key={i} position={[cx, cy, 0.06]}>
              <boxGeometry args={[0.4, 0.44, 0.02]} />
              <meshStandardMaterial
                color={i === 1 ? "#f2ead6" : "#4a86b0"}
                roughness={0.6}
                flatShading
              />
            </mesh>
          ))}
          <mesh position={[0.26, 1.96, 0.08]}>
            <boxGeometry args={[0.18, 0.18, 0.02]} />
            <meshStandardMaterial color="#c85c4a" roughness={0.6} />
          </mesh>
        </>
      )}

      {/* floating label / button */}
      <Html position={[0, 2.55, 0]} center distanceFactor={11} zIndexRange={[18, 0]}>
        <button className="jrnKioskTag" onClick={() => open()}>
          {spec.label}
        </button>
      </Html>
    </group>
  );
}

export default function GameKiosk() {
  return (
    <group>
      {KIOSKS.map((spec) => (
        <Kiosk key={spec.which} spec={spec} />
      ))}
    </group>
  );
}
