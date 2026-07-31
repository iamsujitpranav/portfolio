"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { walkHeight } from "@/lib/journey/terrain";
import { STOP_SIGN_OFFSETS } from "@/lib/journey/sections";
import { nodeById } from "@/lib/journey/graph";
import { game } from "@/lib/journey/game";
import { warp } from "@/lib/journey/warp";
import type { Nav } from "./Avatar";

export type DisplayFocus = { id: string; x: number; y: number; z: number; fx?: number; fz?: number };

// Never let the camera dip below the ground (that's what let you "see under the
// snow"): keep it at least this far above the terrain wherever it hovers.
const GROUND_CLEARANCE = 1.2;
const ARCHITECT_MIN_DISTANCE = 6.5;
const ARCHITECT_MAX_DISTANCE = 10;
const ARRIVAL_BOARD_DISTANCE = 3.8;

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
  const { camera, gl } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useRef<any>(null);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const behind = useMemo(() => new THREE.Vector3(), []);
  const init = useRef(false);
  const seenWarp = useRef(warp.seq);
  const lockedTarget = useMemo(() => new THREE.Vector3(), []);
  const lockedPosition = useMemo(() => new THREE.Vector3(), []);
  const pointerOrbit = useRef(false);
  const lockTarget = useRef(false);
  const architectBoard = useMemo(() => {
    const node = nodeById("cross");
    const [dx, dz] = STOP_SIGN_OFFSETS.start;
    const x = (node?.x ?? -2) + dx + 0.27;
    const z = (node?.z ?? -72) + dz;
    return new THREE.Vector3(x, walkHeight(x, z) + 2.3, z);
  }, []);

  useEffect(() => {
    const beginPointerOrbit = () => { pointerOrbit.current = true; };
    const endPointerOrbit = () => { pointerOrbit.current = false; };
    gl.domElement.addEventListener("pointerdown", beginPointerOrbit);
    gl.domElement.addEventListener("pointerup", endPointerOrbit);
    gl.domElement.addEventListener("pointercancel", endPointerOrbit);
    return () => {
      gl.domElement.removeEventListener("pointerdown", beginPointerOrbit);
      gl.domElement.removeEventListener("pointerup", endPointerOrbit);
      gl.domElement.removeEventListener("pointercancel", endPointerOrbit);
    };
  }, [gl]);

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
      // OPENING SHOT: face The Architect board squarely from its front. The
      // board's face points along +Z, so placing the camera on that same normal
      // keeps both vertical edges parallel and prevents the shot drifting left.
      // Eight metres makes the board fill the frame while keeping its edges in
      // view on the wide canvas.
      camera.position.set(architectBoard.x, architectBoard.y, architectBoard.z + 8);
      lockedPosition.copy(camera.position);
      lockedTarget.copy(architectBoard);
      ctrl.target.copy(lockedTarget);
      ctrl.update();
      camera.lookAt(lockedTarget);
      lockTarget.current = true;
      init.current = true;
      return;
    }

    if (seenWarp.current !== warp.seq) {
      seenWarp.current = warp.seq;
      if (warp.pose === "architect") {
        camera.position.set(architectBoard.x, architectBoard.y, architectBoard.z + 8);
        lockedPosition.copy(camera.position);
        lockedTarget.copy(architectBoard);
        ctrl.target.copy(lockedTarget);
        ctrl.update();
        camera.lookAt(lockedTarget);
        lockTarget.current = true;
        init.current = true;
        return;
      }

      const warpCurve = edgeCurves.get(warp.destEdgeId) ?? ec;
      const warpPoint = warpCurve.getPointAt(THREE.MathUtils.clamp(warp.destTAB, 0, 1));
      fwd.set(warp.lookX - warpPoint.x, 0, warp.lookZ - warpPoint.z);
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
      fwd.normalize();
      // Resume stops should land as readable sign-board portraits: aim at the
      // physical board/terminal supplied by JourneyOverlay and move in close
      // enough that it owns the frame. The Architect has its separate authored
      // opening pose above; this only affects the other teleport arrivals.
      const dist = ARRIVAL_BOARD_DISTANCE;
      camera.position.set(warpPoint.x - fwd.x * dist + fwd.z * SHOULDER,  walkHeight(warpPoint.x, warpPoint.z) + EYE_Y + dist * 0.12, warpPoint.z - fwd.z * dist - fwd.x * SHOULDER);
      // Preserve the computed arrival pose; the idle branch reapplies this
      // lock on every subsequent frame.
      lockedPosition.copy(camera.position);
      lockedTarget.set(
        warp.lookX,
        walkHeight(warp.lookX, warp.lookZ) + 2.65,
        warp.lookZ,
      );
      ctrl.target.copy(lockedTarget);
      camera.lookAt(lockedTarget);
      lockTarget.current = true;
      init.current = true;
      ctrl.update();
      camera.lookAt(lockedTarget);
      return;
    }

    // Hold the chase framing through a hurricane kick too — the avatar has
    // stopped, but handing the camera back to free orbit mid-move would drop
    // the shot exactly when there's something to watch.
    if (nav.moving || game.move?.kind === "kick") {
      // Release the static opening/arrival composition as soon as the visitor
      // starts moving, so the chase camera can take over normally.
      lockTarget.current = false;
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
      // Idle: preserve the exact teleport frame until walking or orbiting resumes.
      if (lockTarget.current) {
        // OrbitControls emits the same start event for wheel zoom and pointer
        // orbit. Only a real pointer gesture releases the composition; wheel
        // zoom keeps the board centered. Preserve its depth but restore the
        // authored x/y pose before OrbitControls updates again.
        if (pointerOrbit.current) {
          lockTarget.current = false;
        } else {
          lockedPosition.z = lockedTarget.z + THREE.MathUtils.clamp(
            camera.position.z - lockedTarget.z,
            ARCHITECT_MIN_DISTANCE,
            ARCHITECT_MAX_DISTANCE,
          );
          ctrl.target.copy(lockedTarget);
          camera.position.copy(lockedPosition);
        }
      } else ctrl.target.lerp(desired, 0.06);
    }
    ctrl.update();
    if (lockTarget.current) {
      camera.position.copy(lockedPosition);
      camera.lookAt(lockedTarget);
    }

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
