"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  scatterProps,
  PROP_URL,
  PROPS,
  PROP_BY_KEY,
  type Transform,
} from "@/lib/journey/props";
import { advanceWind, applyWind, windStrengthFor } from "@/lib/journey/wind";
import { applyTopSnow } from "@/lib/journey/snowcover";

// One prepared draw call from a loaded GLB: shared geometry + a cloned material
// with the Kenney metalness quirk fixed, plus the mesh's own local transform so
// multi-part models (trunk + foliage) instance correctly. `minY/maxY` are the
// geometry's local vertical extent, used to weight the wind sway (base → crown).
type Prepared = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrix: THREE.Matrix4;
  minY: number;
  maxY: number;
};

function usePrepared(scene: THREE.Object3D, windStrength: number): Prepared[] {
  return useMemo(() => {
    scene.updateMatrixWorld(true);
    const out: Prepared[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.MeshStandardMaterial;
      const mat = src.clone() as THREE.MeshStandardMaterial;
      // Kenney GLTFs ship metalness=1 → they render black under lighting.
      mat.metalness = 0;
      mat.roughness = 0.85;
      mat.flatShading = true;

      // Kenney's leaf/grass albedo is a flat teal that blends into the green
      // ground and reads as "no leaves". Warm it toward a natural leaf green
      // (pull down blue, lift the green) so the canopy and blades pop.
      const nm = (src.name || "").toLowerCase();
      if (nm.includes("leaf") || nm.includes("grass") || nm.includes("foliage")) {
        mat.color.setRGB(mat.color.r * 1.15, mat.color.g * 1.02, mat.color.b * 0.5);
      }

      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!;
      if (windStrength > 0) {
        applyWind(mat, { strength: windStrength, minY: bb.min.y, maxY: bb.max.y });
      }
      // Snow gathers on every up-facing facet — canopy tops, boulder crowns. This
      // WRAPS the wind hook above (wind sways first, then snow injects), so trees
      // both bend in the breeze and wear snow.
      applyTopSnow(mat);
      mat.needsUpdate = true;

      out.push({
        geometry: m.geometry,
        material: mat,
        matrix: m.matrixWorld.clone(),
        minY: bb.min.y,
        maxY: bb.max.y,
      });
    });
    return out;
  }, [scene, windStrength]);
}

// Cheap deterministic hash → [0,1). Used only client-side for per-instance tint.
function hash01(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function InstancedAsset({ url, transforms }: { url: string; transforms: Transform[] }) {
  const { scene } = useGLTF(url);
  const key = useMemo(() => url.split("/").pop()!.replace(".glb", ""), [url]);
  const def = PROP_BY_KEY.get(key);
  const foliage = def?.kind === "tree" || def?.kind === "plant";
  const prepared = usePrepared(scene, windStrengthFor(key));

  const meshes = useMemo(() => {
    const m4 = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();

    return prepared.map(({ geometry, material, matrix }) => {
      const im = new THREE.InstancedMesh(geometry, material, transforms.length);
      transforms.forEach((t, i) => {
        e.set(0, t.ry, 0);
        q.setFromEuler(e);
        pos.set(t.x, t.y, t.z);
        scl.setScalar(t.s);
        m4.compose(pos, q, scl);
        local.copy(m4).multiply(matrix); // bake the mesh's own offset

        im.setMatrixAt(i, local);

        // Per-instance tint so a stand of trees / patch of grass reads as many
        // individuals, not one solid mass. Brightness-only (never dark enough to
        // hide foliage) with a whisper of green bias for plants.
        const h = hash01(t.x, t.z);
        const b = 0.9 + h * 0.22; // brightness 0.90 → 1.12
        if (foliage) col.setRGB(b, b * 1.03, b * 0.97);
        else col.setRGB(b, b, b);
        im.setColorAt(i, col);
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      // Never frustum-cull an instanced prop group. Each is a single draw call
      // regardless of instance count, so the cost is negligible — and it stops
      // small/clustered set-pieces (the landmark cliffs, cairn, bridge) from
      // popping in and out as the camera orbits.
      im.frustumCulled = false;
      return im;
    });
  }, [prepared, transforms, foliage]);

  return (
    <>
      {meshes.map((im, i) => (
        <primitive key={i} object={im} />
      ))}
    </>
  );
}

// The whole crafted world: trees, rocks, plants, and the pond ring, all placed
// once by scatterProps() and drawn as instanced meshes (one draw call per model
// part, not per instance). The single useFrame here ticks the shared wind clock.
export default function Scatter() {
  const placement = useMemo(() => scatterProps(), []);
  const entries = useMemo(() => [...placement.entries()], [placement]);

  useFrame((_, delta) => advanceWind(delta));

  return (
    <group>
      {entries.map(([key, transforms]) => (
        <InstancedAsset key={key} url={PROP_URL(key)} transforms={transforms} />
      ))}
    </group>
  );
}

// Warm the GLB cache in the browser only — never during SSR/prerender.
if (typeof window !== "undefined") {
  for (const p of PROPS) useGLTF.preload(PROP_URL(p.key));
}
