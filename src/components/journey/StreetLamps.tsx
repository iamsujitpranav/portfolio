"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { height, insidePond } from "@/lib/journey/terrain";
import { skyExtra } from "@/lib/journey/daynight";
import { nearSideRoad } from "@/lib/journey/sideroad";
import {
  EDGE_IDS,
  VILLAGE_EDGE_IDS,
  edgeLength,
  edgePointXZ,
  besideEdge,
  distanceToGraph,
  spineUToPoint,
} from "@/lib/journey/graph";
import { FOUNTAINS, SQUARE_CLEARINGS, LIBRARY } from "@/lib/journey/settlement";
import { STOPS } from "@/lib/journey/sections";
import { KIOSK_PLACES } from "@/lib/journey/attractions";
import { CURL_SHEET } from "@/lib/journey/config";

// Wrought-iron lanterns lining EVERY road of the network — not just the grand
// tour. Each edge gets lamps at ~22 m spacing on alternating shoulders (the
// village lane is skipped: its frontage is lit by the buildings' own windows
// and lanterns, and a post there would crowd the porches), and the two fountain
// plazas get their own facing pair. Dark and quiet by day, they ignite through
// dusk (driven by skyExtra.night) — warm bulbs that bloom, soft halos, and a
// faked pool of light on the snow beneath each one. Everything is instanced:
// one draw call per part regardless of how many lamps line the roads.
//
// Each lamp has a local frame with +X pointing inward across the path (the arm
// reaches over the trail) and +Y = world up, so every part is authored once in
// lamp-space and stamped onto each lamp via baseMatrix * partOffset.

const LAMP_SPACING = 22; // metres of road per lamp
const LATERAL = 3.7; // metres off the centerline (just past the road shoulder)
const POST_H = 4.3;
const ARM_L = 1.35; // how far the lantern reaches in over the path
const BULB_Y = POST_H - 0.28;

// Fixed lamps on the fountain plazas, arms aimed at their fountain: the old
// pair still flanks the library-forecourt fountain in the Old Town, and the
// Town Square (Crossroads) gets an audited pair flanking the junction→fountain
// approach (square_audit.ts).
const FIXED_LAMPS: { x: number; z: number; aimX: number; aimZ: number }[] = [
  { x: -5.6, z: 12.6, aimX: 0, aimZ: 12.4 },
  { x: 5.6, z: 12.6, aimX: 0, aimZ: 12.4 },
  { x: 9.61, z: -75.48, aimX: 6.98, aimZ: -79.96 },
  { x: 2.85, z: -83.11, aimX: 6.98, aimZ: -79.96 },
];

const DARK = "#23272f"; // painted iron
const SNOW_CAP = "#e6ecf4"; // snow settled on the lantern roof
const BULB_WARM = "#ffc978";
const NIGHT_EMISSIVE = 3.6; // bulb emissive at full night (bright enough to bloom)

// Local-space translation helper (parts are authored in lamp-space).
const T = (x: number, y: number, z: number) =>
  new THREE.Matrix4().makeTranslation(x, y, z);

export default function StreetLamps() {
  // Shared materials: dark iron for the structure, snow for the roof caps.
  const ironMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.55, metalness: 0.35, flatShading: true }),
    [],
  );
  const snowMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: SNOW_CAP, roughness: 0.9, metalness: 0, flatShading: true }),
    [],
  );

  // One base matrix per lamp: positioned at the shoulder, oriented so local +X
  // reaches in over the path. Alternating sides make a proper lit avenue. Also
  // record each lamp's inward ground point for the light-pool discs.
  const { bases, pools } = useMemo(() => {
    const bases: THREE.Matrix4[] = [];
    const pools: THREE.Matrix4[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const inward = new THREE.Vector3();
    const zAxis = new THREE.Vector3();
    const pos = new THREE.Vector3();

    // The stop dioramas' set pieces (Dioramas.tsx offsets, same graph math):
    // grove at Skills, crates at Experience, shrine at Ask, flag at the Summit,
    // plus the far-shore oak and the summit cairn. A lamp there stands inside
    // a tree ring or against a plinth.
    const avoid: [number, number][] = [];
    const lat: Record<string, number> = { skills: -8, experience: -6, ask: -5, contact: -4 };
    for (const st of STOPS) {
      const l = lat[st.id];
      if (l === undefined) continue;
      const at = spineUToPoint(st.u);
      const p = edgePointXZ(at.edgeId, at.tAB);
      const a = edgePointXZ(at.edgeId, Math.min(1, at.tAB + 0.02));
      const b = edgePointXZ(at.edgeId, Math.max(0, at.tAB - 0.02));
      let tx = a[0] - b[0];
      let tz = a[1] - b[1];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      avoid.push([p[0] - tz * l, p[1] + tx * l]);
    }
    avoid.push([47, -37], [15, -135.5]); // the oak, the cairn
    // The kiosk boards stand at the same shoulder offset lamps use — a post
    // right against a board reads as clutter; so does one on the curling ice.
    avoid.push(
      [KIOSK_PLACES.tictactoe.x, KIOSK_PLACES.tictactoe.z],
      [KIOSK_PLACES.match.x, KIOSK_PLACES.match.z],
      [CURL_SHEET.hackX, CURL_SHEET.hackZ],
      [CURL_SHEET.buttonX, CURL_SHEET.buttonZ],
    );

    // A post foot is bad when it stands in the village side-road lane (the van
    // would plough it), in ANOTHER lane of the network (shoulder offsets near a
    // junction land on the crossing road), on the pond (the bridge carries its
    // own rail posts), on a fountain plaza (those get the FIXED pairs), on a
    // reserved clearing of the Town Square, inside the library's footprint, or
    // against a stop's set piece.
    const bad = (x: number, z: number) =>
      nearSideRoad(x, z, 0.9) ||
      distanceToGraph(x, z) < 2.4 ||
      insidePond(x, z, 0.8) ||
      FOUNTAINS.some((f) => Math.hypot(x - f.x, z - f.z) < 4.2) ||
      SQUARE_CLEARINGS.some((b) => Math.hypot(x - b.x, z - b.z) < 3.0) ||
      (Math.abs(x - LIBRARY.x) < LIBRARY.hw + 1.2 &&
        z > LIBRARY.z - LIBRARY.front - 1.2 &&
        z < LIBRARY.z + LIBRARY.rear + 1.2) ||
      avoid.some(([ax, az]) => Math.hypot(x - ax, z - az) < 4.5);

    // Post at (bx,bz) with the arm reaching along `inward` — shared by the
    // road lamps and the fixed plaza lamps.
    const plant = (bx: number, bz: number, inX: number, inZ: number) => {
      pos.set(bx, height(bx, bz), bz);
      inward.set(inX, 0, inZ).normalize();
      zAxis.crossVectors(inward, up).normalize();
      const base = new THREE.Matrix4().makeBasis(inward, up, zAxis);
      base.setPosition(pos);
      bases.push(base);
      const px = bx + inward.x * ARM_L;
      const pz = bz + inward.z * ARM_L;
      pools.push(
        T(px, height(px, pz) + 0.06, pz).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)),
      );
    };

    // EVERY network road, ~LAMP_SPACING m apart, alternating shoulders. Feet
    // are deduped: two edges meeting at a junction can each put a lamp on the
    // shared corner, and twin posts 2 m apart read as a glitch.
    const feet: [number, number][] = FIXED_LAMPS.map((f) => [f.x, f.z]);
    const crowded = (x: number, z: number) =>
      feet.some(([fx, fz]) => Math.hypot(x - fx, z - fz) < 3.2);
    let alt = 0;
    for (const id of EDGE_IDS) {
      if (VILLAGE_EDGE_IDS.has(id)) continue; // lit by its own frontages
      const L = edgeLength(id);
      const n = Math.max(1, Math.round(L / LAMP_SPACING));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        let side: 1 | -1 = alt++ % 2 === 0 ? 1 : -1;
        let b = besideEdge(id, t, side, LATERAL);
        if (bad(b.x, b.z) || crowded(b.x, b.z)) {
          side = side === 1 ? -1 : 1;
          b = besideEdge(id, t, side, LATERAL);
          if (bad(b.x, b.z) || crowded(b.x, b.z)) continue;
        }
        feet.push([b.x, b.z]);
        const lane = edgePointXZ(id, t);
        plant(b.x, b.z, lane[0] - b.x, lane[1] - b.z);
      }
    }

    // The fountain-plaza pairs, arms aimed over the water.
    for (const f of FIXED_LAMPS) plant(f.x, f.z, f.aimX - f.x, f.aimZ - f.z);

    return { bases, pools };
  }, []);

  // Stamp a part geometry across every lamp with a shared material → one draw call.
  const stamp = useMemo(() => {
    return (geo: THREE.BufferGeometry, offset: THREE.Matrix4, mat: THREE.Material, shadow = true) => {
      const m = new THREE.Matrix4();
      const im = new THREE.InstancedMesh(geo, mat, bases.length);
      for (let i = 0; i < bases.length; i++) {
        m.copy(bases[i]).multiply(offset);
        im.setMatrixAt(i, m);
      }
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      im.castShadow = shadow;
      return im;
    };
  }, [bases]);

  // Structural parts (dark iron) + a little snow cap on the lantern roof.
  const structure = useMemo(() => {
    const foot = stamp(new THREE.BoxGeometry(0.44, 0.32, 0.44), T(0, 0.16, 0), ironMat);
    const post = stamp(new THREE.BoxGeometry(0.16, POST_H, 0.16), T(0, POST_H / 2, 0), ironMat);
    const arm = stamp(new THREE.BoxGeometry(ARM_L, 0.12, 0.12), T(ARM_L / 2, POST_H - 0.06, 0), ironMat);
    const bracket = stamp(
      new THREE.BoxGeometry(0.5, 0.12, 0.12),
      T(0.34, POST_H - 0.36, 0).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 4)),
      ironMat,
    );
    const housing = stamp(new THREE.BoxGeometry(0.42, 0.5, 0.42), T(ARM_L, BULB_Y, 0), ironMat);
    const roof = stamp(new THREE.ConeGeometry(0.36, 0.34, 4), T(ARM_L, BULB_Y + 0.42, 0), ironMat);
    const cap = stamp(new THREE.ConeGeometry(0.4, 0.16, 4), T(ARM_L, BULB_Y + 0.64, 0), snowMat, false);
    return [foot, post, arm, bracket, housing, roof, cap];
  }, [stamp, ironMat, snowMat]);

  // The glowing bulb — its own instanced mesh so one material drives every bulb.
  const bulbMesh = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: "#2a2113",
      emissive: BULB_WARM,
      emissiveIntensity: 0,
      roughness: 0.4,
      metalness: 0,
    });
    return stamp(new THREE.BoxGeometry(0.26, 0.34, 0.26), T(ARM_L, BULB_Y, 0), mat, false);
  }, [stamp]);

  // Soft additive halo around each bulb.
  const haloMesh = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: "#ffcf8a",
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    return stamp(new THREE.SphereGeometry(0.62, 12, 10), T(ARM_L, BULB_Y, 0), mat, false);
  }, [stamp]);

  // Warm pool of light thrown on the snow beneath each lantern (own ground heights).
  const poolMesh = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: "#ffd68a",
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const geo = new THREE.CircleGeometry(2.6, 24);
    const im = new THREE.InstancedMesh(geo, mat, pools.length);
    for (let i = 0; i < pools.length; i++) im.setMatrixAt(i, pools[i]);
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    return im;
  }, [pools]);

  // Drive the glow from the day/night cycle every frame, with a faint flicker.
  const bulbMat = bulbMesh.material as THREE.MeshStandardMaterial;
  const haloMat = haloMesh.material as THREE.MeshBasicMaterial;
  const poolMat = poolMesh.material as THREE.MeshBasicMaterial;
  const flick = useRef(0);
  useFrame((st) => {
    const n = skyExtra.night;
    flick.current = 0.94 + 0.06 * Math.sin(st.clock.elapsedTime * 5.3);
    const g = n * flick.current;
    bulbMat.emissiveIntensity = g * NIGHT_EMISSIVE;
    haloMat.opacity = g * 0.4;
    poolMat.opacity = g * 0.42;
  });

  return (
    <group>
      {structure.map((im, i) => (
        <primitive key={i} object={im} />
      ))}
      <primitive object={bulbMesh} />
      <primitive object={haloMesh} />
      <primitive object={poolMesh} />
    </group>
  );
}
