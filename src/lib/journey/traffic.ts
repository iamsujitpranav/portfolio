// TRAFFIC — the things on the road the avatar has to walk AROUND.
//
// The avatar is strictly on-rails: it rides an edge curve's centreline and its
// world position is exactly getPointAt(tAB). That is what makes routing simple
// and interruptible — and it is also why it used to walk straight through the
// delivery van and the country pickup. Those two DRIVE on walkable graph edges
// (the pickup shuttles villagegate~cross → cross~contact, which meet AT the Town
// Square, and its line sits within 8 cm of the avatar's own; the village lane
// the van drives IS a walkable edge). Both brake for the avatar; the avatar had
// no idea they existed, so it kept walking and clipped through the bodywork.
//
// The fix is a lateral SIDESTEP, not a stop: the avatar stays on its rails for
// routing and progress, and is displaced sideways off the centreline just far
// enough to clear whatever is in the lane, then eases back. Nothing about the
// route, the arrival, or the tour changes — only where the body is drawn.
//
// Vehicles publish themselves here every frame (or once, if parked); the Avatar
// reads the registry. THREE-free, like every lib/journey module.

export type Blocker = {
  x: number;
  z: number;
  /** Half-width to clear, in metres — how far off its centre a body must pass. */
  r: number;
};

// Keyed so a moving vehicle can rewrite its own entry each frame without
// churning garbage, and so a Canvas remount (the "replay the journey" button
// rebuilds the whole scene) can drop its stale entries on unmount.
const BLOCKERS = new Map<string, Blocker>();

export function setBlocker(id: string, x: number, z: number, r: number) {
  const b = BLOCKERS.get(id);
  if (b) {
    b.x = x;
    b.z = z;
    b.r = r;
  } else {
    BLOCKERS.set(id, { x, z, r });
  }
}

export function dropBlocker(id: string) {
  BLOCKERS.delete(id);
}

/** Roughly the avatar's shoulder half-width. */
const BODY_R = 0.42;

/** Air left between the bodywork and that shoulder. Without it the solver aims
 *  at exactly touching, and the ease-in lag turns "exactly touching" into a
 *  graze whenever the closing speed is high (an oncoming pickup does 3.4 m/s
 *  into a 2.4 m/s jog). */
const CLEAR = 0.3;

// The trail ribbon is drawn 2.85 m either side of the centreline (config
// TRAIL_HALF_WIDTH × 0.95) and the village road 2.3 m, so this keeps even the
// widest sidestep on the road surface rather than out in the deep snow. It is
// also comfortably enough for the job: every vehicle in the fleet is 1.5 m wide
// before scaling — 0.94 m to the side of its centre, measured out of the GLBs —
// so clearing one costs 0.94 + 0.42 + 0.3 = 1.66 m.
export const MAX_SIDESTEP = 1.9;

/** How far ahead a blocker starts to matter. The worst case is an oncoming
 *  pickup at 3.4 m/s met by a 2.42 m/s jog: 5.8 m/s of closing speed, so this is
 *  about a second and a half to complete the manoeuvre. */
const LOOK = 9.0;
/** …and how far behind it still counts, so the avatar cannot cut back in across
 *  the flank of a vehicle it is only halfway past. The longest body in the fleet
 *  is the delivery van at 2.11 m from centre to bumper. */
const BEHIND = 3.5;

/**
 * How far the avatar is currently displaced from its centreline, signed along
 * the right-hand perpendicular of travel. Published for the CAMERA, which frames
 * off the centreline and would otherwise let the avatar slide out of the shot
 * during a pass.
 */
export const drift = { lateral: 0 };

/**
 * The lateral offset that clears every blocker in the lane, measured from the
 * CENTRELINE (not from wherever the avatar currently is — that would be a
 * feedback loop, and it would oscillate).
 *
 * `committed` is the side the caller chose last frame. Passing it back keeps the
 * avatar from dithering left-right around a vehicle it is already committed to
 * going around; 0 means "nothing engaged, choose freely".
 */
export function sidestepFor(
  x: number,
  z: number,
  hx: number,
  hz: number,
  committed: number,
): { offset: number; side: number } {
  if (BLOCKERS.size === 0) return { offset: 0, side: 0 };
  // Right-hand perpendicular of the heading (matches the ribbon's own frame:
  // tangent × up).
  const rx = hz;
  const rz = -hx;

  let want = 0;
  let side = committed;
  let bestMag = 0;

  for (const b of BLOCKERS.values()) {
    const dx = b.x - x;
    const dz = b.z - z;
    const along = dx * hx + dz * hz;
    if (along > LOOK || along < -BEHIND) continue;

    const lat = dx * rx + dz * rz;
    const need = b.r + BODY_R + CLEAR;
    // Already wide enough of the lane to be no trouble — most of the parked
    // fleet lives here, which is why they cost nothing.
    if (Math.abs(lat) >= need) continue;

    // Two ways past: outside its left flank, or outside its right one.
    const left = lat - need;
    const right = lat + need;
    let s = side;
    let o: number;
    if (s === 0) {
      // Free choice — the shorter step round, unless that one would put the
      // avatar off the road, in which case go the long way. Being on the
      // awkward side of a van beats standing in a hedge.
      const preferLeft = Math.abs(left) <= Math.abs(right);
      s = preferLeft ? -1 : 1;
      o = preferLeft ? left : right;
      if (Math.abs(o) > MAX_SIDESTEP) {
        const alt = preferLeft ? right : left;
        if (Math.abs(alt) < Math.abs(o)) {
          s = -s;
          o = alt;
        }
      }
    } else {
      // ALREADY COMMITTED, and the commitment wins. Drawing level with a vehicle
      // sweeps its bearing across the centreline, so the committed side's ideal
      // offset grows as you pass — and switching sides at that moment would walk
      // the avatar straight through the thing it is halfway past. Clamp and
      // hold; CLEAR is the padding that keeps even a clamped pass off the
      // bodywork. The commitment is released the instant nothing is engaged, so
      // it can never persist into a situation it does not belong in.
      o = s > 0 ? right : left;
    }
    o = Math.max(-MAX_SIDESTEP, Math.min(MAX_SIDESTEP, o));

    // The most demanding blocker wins — squeezing past two things at once is
    // not a case this world can produce, and averaging them would clear neither.
    if (Math.abs(o) > bestMag) {
      bestMag = Math.abs(o);
      want = o;
      side = s;
    }
  }

  return { offset: want, side: bestMag > 0 ? side : 0 };
}
