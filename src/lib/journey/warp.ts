// THE MAP WARP — a click on the trail map puts you there.
//
// Every other way of getting around this world walks, and should: the Trail
// menu, the guided tour and the assistant are all *taking you somewhere*, and
// the journey between stops is half the point. The map is not that. Somebody
// who opens a top-down map and clicks the far corner of it wants to BE there —
// making them watch ninety seconds of snow go past first is the map failing to
// be a map.
//
// So a map click teleports. The catch is that a character who simply blinks
// into existence reads as a rendering glitch, so the arrival gets a shot of its
// own: the camera opens on the clear road behind the avatar and holds while
// they materialise out of the snow. It then dollies closer on that same bearing,
// avoiding the signs and roadside props that a sweeping orbit would cross. The
// thing that was actually clicked — the landmark, kiosk or street — remains
// framed past the avatar throughout.
//
// THREE-free, like every other lib/journey module: this is a mutable singleton
// the DOM overlay writes and the R3F camera + avatar read every frame, exactly
// the pattern `game` and `tour` already use, so no props are threaded through
// the scene to make it work.

import { edgeLength, edgePointXZ } from "./graph";

/** Seconds the camera holds the wide arrival before it starts to dolly. */
export const WARP_FACE = 1.4;
/** Seconds of the wide-to-close arrival dolly. */
export const WARP_TURN = 2.8;
export const WARP_TOTAL = WARP_FACE + WARP_TURN;
/** Seconds of the feet→head materialise. Faster than the opening reveal (1.9 s):
 *  that one is a title sequence, this one has to be over before the camera moves. */
export const WARP_MATERIALISE = 0.9;

export const warp = {
  /** Bumps on every teleport. The Avatar and the camera watch it to SNAP —
   *  facing, sidestep, framing — instead of easing over from wherever the last
   *  spot was, which across half the map would be a very long slide. */
  seq: 0,
  /** An arrival shot is running: the camera is on rails until it ends. */
  active: false,
  /** Seconds into the shot (integrated by CameraRig, the only frame loop that
   *  owns it). */
  t: 0,
  /** What this arrival is ABOUT, in world XZ — the landmark, the kiosk, or a
   *  point down the road when the spot has nothing beside it. The avatar turns
   *  to face it and the camera's swing ends framed on it. */
  lookX: 0,
  lookZ: 0,
  /** Most arrivals place the body on the road cursor. The Architect is the
   * authored exception: its opening portrait uses the off-road plaza pose in
   * front of the board, and returning there must reproduce that composition. */
  pose: "trail" as WarpPose,
  destEdgeId: "",
  destTAB: 0,
};

export type WarpPose = "trail" | "architect";

/**
 * Teleport landed: aim everything at `look` and start the arrival shot.
 *
 * `shot: false` is the reduced-motion path — the avatar still appears and the
 * card still opens, there's just no camera choreography to sit through.
 */
export function beginWarp(
  lookX: number,
  lookZ: number,
  shot = true,
  pose: WarpPose = "trail",
  destEdgeId = "",
  destTAB = 0,
) {
  warp.seq++;
  warp.lookX = lookX;
  warp.lookZ = lookZ;
  warp.pose = pose;
  warp.destEdgeId = destEdgeId;
  warp.destTAB = destTAB;
  warp.t = 0;
  warp.active = shot;
}

/** End the shot: it ran its course, the visitor grabbed the camera, or they set
 *  off walking. Whatever the reason, the camera is theirs again from here. */
export function endWarp() {
  warp.active = false;
}

/**
 * Has a warp landed since this caller last looked? Consumes the arrival, so
 * each caller sees it exactly once.
 *
 * The u-crossing games (collectibles, obstacles) already discard any jump in
 * the spine scalar bigger than a stride, which catches almost every teleport by
 * accident. Almost: warp somewhere a few metres away and the jump is stride-
 * sized, and a hidden secret you never walked past would count itself, or a log
 * would trigger a hurricane kick at a character who has been standing there for
 * one frame. Asking outright is exact where the heuristic is only usually right.
 */
export function warpedSince(seen: { seq: number }): boolean {
  if (seen.seq === warp.seq) return false;
  seen.seq = warp.seq;
  return true;
}

/** How far off the road a marker has to sit before it's worth turning toward.
 *  Anything closer is effectively underfoot — a snowball target, an obstacle —
 *  and gives the shot no direction to end on. */
export const WARP_LOOK_MIN = 3;

/**
 * A point up to ~14 m down the road from (edgeId, tAB): what an arrival faces
 * when there's nothing standing beside it to look at. Every résumé stop is a
 * junction the roads fan out from, so "along the road" reliably opens the
 * street the place is built on, where aiming at nothing would end the shot on
 * the back of the avatar's head.
 *
 * Always heads for the FURTHER end of the edge, clamped to it. Some edges are
 * shorter than the 14 m we'd like — Old Town to the Arc is 8.94 m — and picking
 * a direction first would let the clamp land right back on the point we started
 * from, leaving the shot with no axis to turn around at all.
 */
export function roadAhead(edgeId: string, tAB: number): { x: number; z: number } {
  const f = 14 / Math.max(1, edgeLength(edgeId));
  const t = 1 - tAB >= tAB ? Math.min(1, tAB + f) : Math.max(0, tAB - f);
  const [x, z] = edgePointXZ(edgeId, t);
  return { x, z };
}
