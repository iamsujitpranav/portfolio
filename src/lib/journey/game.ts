// Cross-cutting mini-game state — the obstacle runner, snowball targets, hidden
// collectibles, curling, and the village kiosk games. Mutable module singletons
// (the same pattern as `nav` in Avatar.tsx and `skyExtra` in daynight.ts): the
// R3F scene writes and reads these every frame while the DOM HUD polls them, so
// a single source of truth drives both worlds with no prop-drilling. THREE-free.

import {
  KICK_MOVES,
  VAULT_MOVES,
  DANCE_MOVES,
  DANCE_FINISH,
  THROW_RELEASE,
  type MotionName,
} from "./config";

export type ToastKind = "secret" | "hit" | "score" | "board";
/** DOM mini-games that a village kiosk can open. */
export type ModalGame = "tictactoe" | "match";
export type Toast = { id: number; text: string; kind: ToastKind; born: number };

/**
 * A one-shot motion layered over the walk/idle pose.
 * - `kick` halts the walker, connects at `impact`, and launches the obstacle.
 * - `vault` keeps them moving and arcs them over it (the shared jump integrator
 *   does the lifting, so the existing airborne test scores the clear).
 * - `throw` lobs a snowball; the ball leaves the hand at `impact` (no halt).
 * - `dance` only plays while standing still.
 */
export type Move = {
  kind: "kick" | "vault" | "throw" | "dance";
  clip: MotionName;
  impact: number; // fraction through the clip where the foot connects / ball releases
  spin: number; // whole-body rotation added at the object level (radians)
  v0?: number; // vaults: launch velocity, so the clip can be retimed to the hop
};

// World-space avatar position — written every frame by whichever walker is
// mounted (Avatar.tsx), read by anything that needs proximity to the player
// (the side-road van brakes for them instead of driving through).
export const avatarPos = { x: 0, y: 0, z: 0 };

// A world-space point the avatar should turn to face while standing (set by the
// snowball throw so the toss aims at the snowman). Null = use the default facing
// (travel direction when moving, the camera when idle).
export const faceTarget = { active: false, x: 0, z: 0 };

export const game = {
  active: false, // true only while the journey is running & revealed

  // --- jump / obstacle runner --------------------------------------------
  // There is deliberately NO points/combo score: the games are here to make the
  // walk playful, not to be won. The only thing counted is `secretsFound` — and
  // that's a résumé-facts collection, not a score.
  jumpQueued: false, // set by a keypress, consumed by the jump integrator
  airborne: false, // integrator writes each frame; obstacles read it to score a clear
  jumpY: 0, // current vertical hop offset (the Avatar adds this to position.y)
  cleared: 0,
  stumbles: 0,
  shake: 0, // camera-shake impulse (0..1); CameraRig reads and decays it
  lurch: 0, // stumble impulse (0..1); Avatar reads it for a trip-lean + brief slowdown

  // --- one-shot moves (kick / vault / dance) ------------------------------
  // The overlay motion currently playing over the locomotion pose. Obstacles
  // request one, the Avatar plays the clip and reports the impact frame, and the
  // requesting obstacle launches itself when its id comes back. Only a KICK
  // halts the runner: a vault carries them over the obstacle mid-stride.
  move: null as Move | null,
  moveBlockerId: null as number | null, // obstacle that triggered the move
  moveImpactId: null as number | null, // obstacle the foot has just connected with

  // --- sprint -------------------------------------------------------------
  sprint: false, // visitor is holding the accelerator

  // --- collectibles -------------------------------------------------------
  secretsFound: 0,
  secretsTotal: 0,

  // --- village kiosks -----------------------------------------------------
  // Which DOM mini-game modal is open, if any. One field rather than a flag per
  // game, so adding a kiosk never means touching the HUD's poll loop again.
  modal: null as ModalGame | null,

  // --- snowball throw -----------------------------------------------------
  // Bumps each time a throw animation hits its release frame; Snowballs.tsx
  // watches it and launches the actual ball then, so the toss syncs to the arm.
  throwReleaseSeq: 0,

  // --- curling on the frozen pond ----------------------------------------
  curlStones: 0, // stones thrown in the current end (0..CURL_STONES)
  curlEndScore: 0,

  // --- HUD toasts ---------------------------------------------------------
  toasts: [] as Toast[],
  rev: 0, // bumps whenever HUD-visible state changes (cheap poll signal)
};

const now = () => (typeof performance !== "undefined" ? performance.now() : 0);

let toastId = 1;
export function pushToast(text: string, kind: ToastKind = "score") {
  game.toasts.push({ id: toastId++, text, kind, born: now() });
  if (game.toasts.length > 4) game.toasts.shift();
  game.rev++;
}

/** Register a stumble (missed obstacle): kick the camera and trip the walker. */
export function stumble() {
  game.stumbles++;
  game.shake = 1;
  game.lurch = 1;
  game.rev++;
}

/** Accelerate (or ease off). Held on Shift, toggled from the HUD button. */
export function setSprint(on: boolean) {
  if (game.sprint === on) return;
  game.sprint = on;
  game.rev++;
}

/** Open / close a kiosk mini-game modal. */
export function openModal(which: ModalGame) {
  game.modal = which;
  game.rev++;
}
export function closeModal() {
  game.modal = null;
  game.rev++;
}

// --- move rotation ----------------------------------------------------------
// Two counters, so the *kind* of move alternates while the kicks themselves
// cycle independently. Meeting seven obstacles therefore plays: hurricane kick,
// leap, roundhouse, big jump, MMA kick, leap, side kick — never the same beat
// twice running, and every obstacle kind gets the right way over it.
let moveTurn = 0;
let kickTurn = 0;

const KICK_LABELS: Record<string, string> = {
  kickHurricane: "Hurricane kick!",
  kickRoundhouse: "Roundhouse!",
  kickMma: "MMA kick!",
  kickSide: "Side kick!",
};

/** Pick the next way past an obstacle: kick it clear, or go over it. */
export function nextObstacleMove(kind: "log" | "rock"): Move {
  const vaultTurn = moveTurn++ % 2 === 1;
  if (vaultTurn) {
    const v = VAULT_MOVES[kind];
    return { kind: "vault", clip: v.clip, impact: 0, spin: 0, v0: v.v0 };
  }
  const k = KICK_MOVES[kickTurn++ % KICK_MOVES.length];
  return { kind: "kick", clip: k.clip, impact: k.impact, spin: k.spin };
}

/**
 * Commit a planned move against an obstacle. Called at the move's *own* trigger
 * distance — a vault launches early enough to be at the top of its arc over the
 * obstacle, a kick starts once the runner has pulled up short of it — so the
 * plan is chosen by `nextObstacleMove` well before this fires.
 *
 * Returns false if another move is still playing, in which case the caller
 * should keep trying: obstacles can bunch up when the visitor is sprinting.
 */
export function startObstacleMove(id: number, move: Move): boolean {
  if (!game.active) return false;
  if (game.move || game.moveBlockerId !== null) return false;
  game.move = move;
  game.moveBlockerId = id;
  if (move.kind === "vault") launchJump(move.v0 ?? JUMP_V0);
  game.rev++;
  return true;
}

/** Play a one-shot that isn't tied to an obstacle (the manual Space hop, a dance). */
export function playMove(move: Move) {
  if (game.move) return;
  game.move = move;
  game.rev++;
}

/** Contact frame of a kick: the blocking obstacle takes the hit and launches. */
export function landKick() {
  game.moveImpactId = game.moveBlockerId;
  game.shake = 0.8;
  game.cleared++;
  pushToast(KICK_LABELS[game.move?.clip ?? ""] ?? "Kick!", "hit");
}

/** Clip finished — release the runner. */
export function endMove() {
  game.move = null;
  game.moveBlockerId = null;
  faceTarget.active = false;
  game.rev++;
}

// --- snowball throw ---------------------------------------------------------
/**
 * Wind up to pelt a snowman. Plays the throw one-shot and points the avatar at
 * the target (world x,z) so the toss reads. Returns false if a move is already
 * playing, so the caller doesn't queue a ball that will never leave the hand.
 */
export function playThrow(x: number, z: number): boolean {
  if (game.move) return false;
  game.move = { kind: "throw", clip: "throw", impact: THROW_RELEASE, spin: 0 };
  faceTarget.active = true;
  faceTarget.x = x;
  faceTarget.z = z;
  game.rev++;
  return true;
}

/** Release frame of a throw: the ball leaves the hand now (Snowballs launches it). */
export function releaseThrow() {
  game.throwReleaseSeq++;
  game.rev++;
}

// --- dances -----------------------------------------------------------------
let danceTurn = 0;

/**
 * Celebrate a win. `big` saves the breakdance for the best results; otherwise the
 * hip-hop routines rotate so a repeat win never repeats the routine. Ignored if a
 * move is already playing — a dance should never cut off a kick mid-swing.
 */
export function celebrate(big = false) {
  const clip = big ? DANCE_FINISH : DANCE_MOVES[danceTurn++ % DANCE_MOVES.length];
  playMove({ kind: "dance", clip, impact: 0, spin: 0 });
}

/** Register a cleared obstacle — vaulted clean over it. */
export function clearObstacle() {
  game.cleared++;
  pushToast("Clean vault!", "hit");
}

// --- jump physics (shared so the real avatar and the capsule fallback hop the
// exact same arc). A single tap launches; gravity brings it back down. A vault
// over an obstacle uses the same integrator with a taller launch. -------------
export const JUMP_V0 = 5.6; // launch velocity (m/s) — apex ≈ 1.0 world unit
export const GRAVITY = 16; // m/s^2
const jump = { v: 0, active: false };

/** Seconds from launch to apex — how early a vault must leave the ground. */
export const jumpRise = (v0: number) => v0 / GRAVITY;

export function queueJump() {
  if (game.active) game.jumpQueued = true;
}

/** Launch the hop right now at a given velocity (vaults pick their own height). */
export function launchJump(v0: number) {
  jump.active = true;
  jump.v = v0;
  game.jumpQueued = false;
}

export function stepJump(dt: number): number {
  if (game.jumpQueued && !jump.active) {
    jump.active = true;
    jump.v = JUMP_V0;
    game.jumpQueued = false;
    // Give the manual hop a real animation instead of floating up mid-run.
    playMove({ kind: "vault", clip: "jumpUp", impact: 0, spin: 0 });
  }
  if (jump.active) {
    game.jumpY += jump.v * dt;
    jump.v -= GRAVITY * dt;
    if (game.jumpY <= 0) {
      game.jumpY = 0;
      jump.v = 0;
      jump.active = false;
    }
  }
  // "High enough to clear an obstacle" — the window an obstacle scores a clear in.
  game.airborne = game.jumpY > 0.45;
  // Stumble-lurch recovery lives here too: stepJump is the one per-frame game
  // integrator both walker variants call, so the trip eases out identically.
  if (game.lurch > 0) game.lurch = Math.max(0, game.lurch - dt * 1.6);
  return game.jumpY;
}

/** Wipe per-run state (called when a fresh journey launches). */
export function resetGame() {
  game.cleared = 0;
  game.stumbles = 0;
  game.secretsFound = 0;
  game.jumpY = 0;
  game.airborne = false;
  game.jumpQueued = false;
  game.shake = 0;
  game.lurch = 0;
  game.move = null;
  game.moveBlockerId = null;
  game.moveImpactId = null;
  game.throwReleaseSeq = 0;
  faceTarget.active = false;
  game.sprint = false;
  game.modal = null;
  game.curlStones = 0;
  game.curlEndScore = 0;
  game.toasts = [];
  jump.active = false;
  jump.v = 0;
  game.rev++;
}
