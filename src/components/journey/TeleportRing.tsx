"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { avatarPos } from "@/lib/journey/game";
import { walkHeight } from "@/lib/journey/terrain";
import { warp, WARP_MATERIALISE } from "@/lib/journey/warp";

// The floor glow is deliberately short-lived. The spiral is the hero of the
// arrival: it follows the same feet-to-head timing as Avatar's reveal.
const WARP_EFFECT_LIFE = Math.max(1.25, WARP_MATERIALISE + 0.35);
const INITIAL_EFFECT_LIFE = 1.95;
const SPIRAL_POINTS = 72;
const SPARK_COUNT = 18;
const SPIRAL_HEIGHT = 2.2;
const SPIRAL_RADIUS = 0.52;

function easeOut(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

export default function TeleportRing() {
  const ground = useRef<THREE.Mesh>(null);
  const groundMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const floorGlow = useRef<THREE.Mesh>(null);
  const floorGlowMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const teleportLight = useRef<THREE.PointLight>(null);
  const sparkRefs = useRef<Array<THREE.Mesh | null>>([]);
  const sparkMaterials = useRef<Array<THREE.MeshBasicMaterial | null>>([]);
  const seen = useRef(warp.seq);
  const elapsed = useRef(WARP_EFFECT_LIFE);
  const effectLife = useRef(WARP_EFFECT_LIFE);
  const initialShown = useRef(false);

  // Reuse one dynamic path for both the bright core and the softer point glow.
  const spiralGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(SPIRAL_POINTS * 3), 3),
    );
    return geometry;
  }, []);

  const spiralLine = useMemo(() => {
    const line = new THREE.Line(
      spiralGeometry,
      new THREE.LineBasicMaterial({
        color: "#ffc247",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    line.visible = false;
    line.renderOrder = 20;
    return line;
  }, [spiralGeometry]);

  const spiralGlow = useMemo(() => {
    const points = new THREE.Points(
      spiralGeometry,
      new THREE.PointsMaterial({
        color: "#ffd36b",
        transparent: true,
        opacity: 0,
        size: 0.16,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    points.visible = false;
    points.renderOrder = 21;
    return points;
  }, [spiralGeometry]);

  useFrame((_, delta) => {
    if (seen.current !== warp.seq) {
      seen.current = warp.seq;
      elapsed.current = 0;
      effectLife.current = WARP_EFFECT_LIFE;
    }

    // Start the same visual on the first page reveal, once the avatar has a
    // real world position instead of the initial origin value.
    if (!initialShown.current && warp.seq === 0 && Math.abs(avatarPos.x) + Math.abs(avatarPos.z) > 1) {
      initialShown.current = true;
      elapsed.current = 0;
      effectLife.current = INITIAL_EFFECT_LIFE;
    }

    if (elapsed.current >= effectLife.current) {
      if (ground.current) ground.current.visible = false;
      if (floorGlow.current) floorGlow.current.visible = false;
      if (teleportLight.current) teleportLight.current.visible = false;
      spiralLine.visible = false;
      spiralGlow.visible = false;
      spiralGeometry.setDrawRange(0, 0);
      sparkRefs.current.forEach((spark) => {
        if (spark) spark.visible = false;
      });
      return;
    }

    elapsed.current += delta;
    const progress = THREE.MathUtils.clamp(elapsed.current / effectLife.current, 0, 1);
    const eased = easeOut(progress);
    const y = walkHeight(avatarPos.x, avatarPos.z) + 0.08;
    const fade = Math.min(1, progress / 0.1) * Math.min(1, (1 - progress) / 0.25);
    const pulse = 0.82 + Math.sin(progress * Math.PI * 10) * 0.18;

    // One golden landing mark on the snow, plus a soft pool of light beneath it.
    if (ground.current) {
      ground.current.visible = true;
      ground.current.position.set(avatarPos.x, y + 0.015, avatarPos.z);
      ground.current.scale.setScalar(0.3 + eased * 1.35);
      ground.current.rotation.z = progress * Math.PI * 0.35;
    }
    if (groundMaterial.current) groundMaterial.current.opacity = fade * 0.95;

    if (floorGlow.current) {
      floorGlow.current.visible = true;
      floorGlow.current.position.set(avatarPos.x, y + 0.025, avatarPos.z);
      floorGlow.current.scale.setScalar(0.45 + eased * 1.2);
    }
    if (floorGlowMaterial.current) floorGlowMaterial.current.opacity = fade * 0.16;

    if (teleportLight.current) {
      teleportLight.current.visible = true;
      teleportLight.current.position.set(
        avatarPos.x + Math.sin(progress * Math.PI * 7) * 0.35,
        y + 1.25 + eased * 1.15,
        avatarPos.z + Math.cos(progress * Math.PI * 7) * 0.35,
      );
      teleportLight.current.intensity = fade * pulse * 4.5;
    }

    const position = spiralGeometry.getAttribute("position") as THREE.BufferAttribute;
    const points = position.array as Float32Array;
    // The head climbs from the feet to above the head. The visible tail is
    // always behind it, which makes the motion read as one glowing snake.
    const head = eased * 1.08;
    const tail = Math.max(0, head - 0.84);
    for (let i = 0; i < SPIRAL_POINTS; i += 1) {
      const along = i / (SPIRAL_POINTS - 1);
      const height = THREE.MathUtils.lerp(tail, head, along);
      const spin = progress * Math.PI * 7.5 + height * Math.PI * 4.2;
      const radius = SPIRAL_RADIUS * (0.94 + Math.sin(along * Math.PI) * 0.08);
      points[i * 3] = avatarPos.x + Math.sin(spin) * radius;
      points[i * 3 + 1] = y + height * SPIRAL_HEIGHT;
      points[i * 3 + 2] = avatarPos.z + Math.cos(spin) * radius;
    }
    position.needsUpdate = true;
    spiralGeometry.setDrawRange(0, SPIRAL_POINTS);
    spiralLine.visible = fade > 0.01;
    spiralGlow.visible = fade > 0.01;
    spiralLine.material.opacity = fade * 0.98;
    spiralGlow.material.opacity = fade * 0.84;

    // Flare beads chase the head at different offsets. Their pulsing size and
    // brightness break the line into sparks instead of making another ring.
    sparkRefs.current.forEach((spark, index) => {
      if (!spark) return;
      const offset = index / SPARK_COUNT;
      const sparkProgress = THREE.MathUtils.clamp(head - offset * 0.62, 0, 1.08);
      const spin = progress * Math.PI * 7.5 + sparkProgress * Math.PI * 4.2;
      const sparkle = 0.8 + 0.2 * Math.sin(progress * Math.PI * 12 + index * 1.7);
      spark.visible = fade > 0.01 && sparkProgress > 0.015;
      spark.position.set(
        avatarPos.x + Math.sin(spin) * SPIRAL_RADIUS,
        y + sparkProgress * SPIRAL_HEIGHT,
        avatarPos.z + Math.cos(spin) * SPIRAL_RADIUS,
      );
      spark.scale.setScalar((0.095 + (index % 3 === 0 ? 0.07 : 0)) * sparkle);
    });
    sparkMaterials.current.forEach((material) => {
      if (material) material.opacity = fade * 0.95;
    });
  });

  return (
    <group>
      <mesh ref={floorGlow} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={18}>
        <circleGeometry args={[1.35, 64]} />
        <meshBasicMaterial
          ref={floorGlowMaterial}
          color="#d98b14"
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={ground} rotation={[Math.PI / 2, 0, 0]} visible={false} renderOrder={19}>
        <torusGeometry args={[1.12, 0.055, 12, 72]} />
        <meshBasicMaterial
          ref={groundMaterial}
          color="#f2b52f"
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <primitive object={spiralLine} />
      <primitive object={spiralGlow} />

      <pointLight
        ref={teleportLight}
        color="#ffb52e"
        distance={4.5}
        decay={2}
        intensity={0}
        visible={false}
      />

      {Array.from({ length: SPARK_COUNT }, (_, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            sparkRefs.current[index] = mesh;
          }}
          visible={false}
          renderOrder={22}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial
            ref={(material) => {
              sparkMaterials.current[index] = material;
            }}
            color={index % 3 === 0 ? "#ffd36b" : "#f0a51a"}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
