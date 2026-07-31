"use client";

import { useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useCursor } from "@react-three/drei";
import { height } from "@/lib/journey/terrain";
import { ASK_TERMINAL } from "@/lib/journey/ask";
import { B, GlowPane } from "./buildingKit";
import type { DisplayFocus } from "./CameraRig";
import MatrixSignFace from "./MatrixSignFace";

// THE TERMINAL — the assistant, standing in the world.
//
// "Ask my résumé" used to be a signpost that told you to leave: click through
// and you were dumped out of the 3D world onto the classic page. So the thing
// itself is here now — a console on the road into the Ask stop, screen lit,
// dish panning the valley. Click the glass and the conversation happens on the
// terminal itself; questions and streaming answers remain visible on its screen.
//
// Built in world metres from the shared kit, like the landmarks. Local +Z faces
// the road (the yaw comes from the site's own front vector), and its pad and
// forest clearing come from the "project" plot settlement.ts appends for it.

const STONE = "#8d8579";
const STONE_DK = "#6f695f";
const TIMBER = "#5b452d";
const TIMBER_DK = "#42331f";
const ROOF = "#5f5348";
const SNOW = "#e6ecf4";
const METAL = "#6d7480";
const METAL_DK = "#464c55";
// Terminal green, deliberately under the composer's 0.82 bloom threshold —
// anything above it flares into a hard disc.
const SCREEN = "#7fe0c0";

function ScreenPrompt({ onOpen, active }: { onOpen: () => void; active: boolean }) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered, "pointer", "auto");

  return (
    <group
      position={[0, 0, 0.14]}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <MatrixSignFace
        width={2.62}
        height={1.16}
        title="ASK MY RÉSUMÉ"
        subtitle="Anything about the work"
        action="CLICK SCREEN TO OPEN"
        system="RESUME_TERMINAL"
        active={active || hovered}
      />
    </group>
  );
}

function Console({ onOpen, active }: { onOpen: () => void; active: boolean }) {
  const dish = useRef<THREE.Group>(null);
  const scan = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // The dish pans the valley, unhurried — it's listening, not searching.
    if (dish.current) dish.current.rotation.y = Math.sin(t * 0.16) * 0.7;
    // A line of light crawling down the screen: the cheapest possible "this
    // thing is running" signal, and it reads from right across the clearing.
    if (scan.current) scan.current.position.y = 0.42 - ((t * 0.34) % 1) * 0.84;
    // The listening ring breathes.
    if (ring.current) {
      const s = 1 + Math.sin(t * 1.1) * 0.06;
      ring.current.scale.set(s, 1, s);
    }
  });

  return (
    <group>
      {/* plinth + step */}
      <B args={[5.4, 0.36, 3.6]} position={[0, 0.18, 0]} color={STONE_DK} />
      <B args={[4.6, 0.3, 2.9]} position={[0, 0.51, 0]} color={STONE} />
      <B args={[2.2, 0.16, 0.7]} position={[0, 0.08, 1.9]} color={STONE_DK} />

      {/* the console: a slab tilted back toward whoever's standing at it */}
      <B args={[3.2, 0.9, 0.5]} position={[0, 1.1, -0.5]} color={METAL_DK} />
      <group position={[0, 1.62, -0.28]} rotation={[-0.42, 0, 0]}>
        <B args={[3.0, 1.5, 0.16]} position={[0, 0, 0]} color={METAL} />
        {/* the screen — lit around the clock, brighter after dark */}
        <GlowPane position={[0, 0, 0.1]} size={[2.72, 1.24]} color={SCREEN} max={0.6} always />
        <group ref={scan}>
          <GlowPane position={[0, 0, 0.11]} size={[2.6, 0.07]} color={SCREEN} max={0.75} additive always />
        </group>
        {/* three rows of "text" that never say anything legible on purpose */}
        {[0.4, 0.12, -0.16].map((y, i) => (
          <GlowPane
            key={y}
            position={[-0.35 + i * 0.12, y, 0.105]}
            size={[1.7 - i * 0.35, 0.05]}
            color={SCREEN}
            max={0.5}
            always
          />
        ))}
        {/* Native WebGL canvas texture: readable in the world regardless of
            DOM/CSS-3D stacking, and the whole glass pane is the click target. */}
        <ScreenPrompt onOpen={onOpen} active={active} />
      </group>

      {/* keys — a shelf of small pale caps under the screen */}
      {[-1.0, -0.6, -0.2, 0.2, 0.6, 1.0].map((x) => (
        <B key={x} args={[0.3, 0.07, 0.5]} position={[x, 1.19, 0.06]} color="#b9b2a6" />
      ))}

      {/* canopy on two posts, keeping the snow off the glass */}
      <B args={[0.18, 2.6, 0.18]} position={[-2.0, 1.9, -0.2]} color={TIMBER} />
      <B args={[0.18, 2.6, 0.18]} position={[2.0, 1.9, -0.2]} color={TIMBER} />
      <B args={[4.9, 0.18, 2.4]} position={[0, 3.25, -0.5]} color={ROOF} />
      <B args={[4.8, 0.12, 2.3]} position={[0, 3.4, -0.5]} color={SNOW} roughness={0.95} />

      {/* mast + panning dish behind it */}
      <B args={[0.2, 4.2, 0.2]} position={[1.5, 2.1, -1.5]} color={METAL_DK} />
      <group ref={dish} position={[1.5, 4.2, -1.5]}>
        <mesh rotation={[Math.PI / 2.6, 0, 0]} castShadow frustumCulled={false}>
          <coneGeometry args={[0.62, 0.42, 10, 1, true]} />
          <meshStandardMaterial color={METAL} roughness={0.7} side={THREE.DoubleSide} flatShading />
        </mesh>
        <B args={[0.07, 0.07, 0.5]} position={[0, 0.16, 0.22]} color={METAL_DK} />
      </group>

      {/* the listening ring set into the plinth in front of the console */}
      <mesh ref={ring} position={[0, 0.68, 1.0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <ringGeometry args={[0.62, 0.78, 24]} />
        <meshBasicMaterial
          color={SCREEN}
          transparent
          opacity={0.5}
          toneMapped={false}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* a bench, because a conversation takes a minute */}
      <B args={[2.6, 0.14, 0.5]} position={[0, 0.92, 2.5]} color={TIMBER} />
      <B args={[0.16, 0.55, 0.4]} position={[-1.0, 0.62, 2.5]} color={TIMBER_DK} />
      <B args={[0.16, 0.55, 0.4]} position={[1.0, 0.62, 2.5]} color={TIMBER_DK} />
    </group>
  );
}

export default function AskTerminal({
  onOpen,
  active = false,
}: {
  onOpen: (focus: DisplayFocus) => void;
  active?: boolean;
}) {
  const y = height(ASK_TERMINAL.x, ASK_TERMINAL.z) - 0.05;
  return (
    <group position={[ASK_TERMINAL.x, y, ASK_TERMINAL.z]} rotation={[0, ASK_TERMINAL.yaw, 0]}>
      <Console
        active={active}
        onOpen={() =>
          onOpen({
            id: "ask",
            x: ASK_TERMINAL.x - ASK_TERMINAL.fx * 0.28,
            y: y + 1.62,
            z: ASK_TERMINAL.z - ASK_TERMINAL.fz * 0.28,
            fx: ASK_TERMINAL.fx,
            fz: ASK_TERMINAL.fz,
          })
        }
      />
    </group>
  );
}
