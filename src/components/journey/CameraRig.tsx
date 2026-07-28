"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { walkHeight } from "@/lib/journey/terrain";
import { game } from "@/lib/journey/game";
import type { Nav } from "./Avatar";

// Never let the camera dip below the ground (that's what let you "see under the
// snow"): keep it at least this far above the terrain wherever it hovers.
const GROUND_CLEARANCE = 1.2;

// Close third-person framing. The camera rides just behind and slightly off the
// runner's shoulder at head height, so the avatar fills the frame and its face
// reads whenever it turns (it turns to face the camera at every stop). Widen
// CHASE_FAR if you want more of the landscape and less character.
const CHASE_NEAR = 3.2; // metres behind the avatar at the tightest
const CHASE_FAR = 5.2;
const KICK_FAR = 6.4; // the hurricane kick needs room to read — ease back for it
const SHOULDER = 0.85; // lateral offset, so we're not staring at the back of the head
const EYE_Y = 1.55; // camera height above the avatar's feet
const LOOK_Y = 1.45; // aim point: head/upper chest rather than the belt

// Bruno-style camera: the user can drag to orbit and scroll to zoom, but the
// orbit *target* smoothly tracks the avatar — so the character is always framed
// and the whole view glides along as they walk, without taking control away.
export default function CameraRig({
  edgeCurves,
  nav,
}: {
  edgeCurves: Map<string, THREE.CatmullRomCurve3>;
  nav: Nav;
}) {
  const { camera } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useRef<any>(null);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const behind = useMemo(() => new THREE.Vector3(), []);
  const init = useRef(false);

  useFrame((_, delta) => {
    // The avatar's spot on the path graph: its current edge's curve at tAB.
    const ec = edgeCurves.get(nav.edgeId);
    if (!ec) return;
    const tt = THREE.MathUtils.clamp(nav.tAB, 0, 1);
    const p = ec.getPointAt(tt);
    desired.set(p.x, p.y + LOOK_Y, p.z); // aim at the head, not the belt
    const ctrl = controls.current;
    if (!ctrl) return;

    if (!init.current) {
      // OPENING SHOT: the avatar spawns on the TOWN SQUARE — the five-way
      // Crossroads. Open from the north-west looking south-east, straight down
      // the junction→fountain axis, so the frame reads the whole square past
      // the avatar: the grand frozen fountain and its arc of social boards in
      // the south-east wedge, the flanking lamps, and the summit road running
      // off behind. (The square's furniture sits at bisector ≈318° from the
      // node — square_audit.ts — so a NW camera stacks all of it in view.)
      camera.position.set(p.x - 6.5, p.y + EYE_Y + 1.7, p.z + 7.5);
      ctrl.target.copy(desired);
      ctrl.update();
      init.current = true;
      return;
    }

    // Hold the chase framing through a hurricane kick too — the avatar has
    // stopped, but handing the camera back to free orbit mid-move would drop
    // the shot exactly when there's something to watch.
    if (nav.moving || game.move?.kind === "kick") {
      // Chase cam: swing just behind the avatar's travel direction and hold
      // there, close and at head height, so the character carries the frame.
      const tan = ec.getTangentAt(tt);
      fwd.set(tan.x * nav.dir, 0, tan.z * nav.dir);
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
      fwd.normalize();

      // Respect the user's zoom, but only within a tight over-the-shoulder
      // range — and give the kick a little more room to read.
      const kicking = game.move?.kind === "kick";
      const far = kicking ? KICK_FAR : CHASE_FAR;
      const dist = THREE.MathUtils.clamp(
        camera.position.distanceTo(ctrl.target),
        CHASE_NEAR,
        far,
      );
      behind.set(
        p.x - fwd.x * dist + fwd.z * SHOULDER,
        p.y + EYE_Y + dist * 0.12,
        p.z - fwd.z * dist - fwd.x * SHOULDER,
      );
      camera.position.lerp(behind, kicking ? 0.05 : 0.09);
      ctrl.target.lerp(desired, 0.14);
    } else {
      // Idle: free orbit — just keep the target gliding onto the avatar.
      ctrl.target.lerp(desired, 0.06);
    }
    ctrl.update();

    // A short jolt on impact (a stumble, or a landed hurricane kick).
    if (game.shake > 0.001) {
      const s = game.shake * 0.22;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camera.position.z += (Math.random() - 0.5) * s;
      game.shake = Math.max(0, game.shake - delta * 2.6);
    }

    // Keep the camera above the ground it's hovering over, so orbiting low or
    // zooming in never punches the view under the terrain (walkHeight: over the
    // pond the floor is the bridge deck, not the basin under it).
    const floor = walkHeight(camera.position.x, camera.position.z) + GROUND_CLEARANCE;
    if (camera.position.y < floor) camera.position.y = floor;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      minDistance={2.2}
      maxDistance={45}
      minPolarAngle={0.15}
      maxPolarAngle={1.4}
    />
  );
}
