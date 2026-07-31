// ---------------------------------------------------------------------------
// Journey world configuration.
//
// Drop your Ready Player Me files in public/models/ (see that folder's README):
//   public/models/avatar.glb      → your full-body avatar  (loaded as /models/avatar.glb)
//   public/models/animations.glb  → walk/idle clips        (optional)
//
// Or point at hosted URLs via env instead of committing the files:
//   NEXT_PUBLIC_AVATAR_URL, NEXT_PUBLIC_ANIMATIONS_URL
//
// REMOTE_AVATAR_FALLBACK is used only if the local avatar fails to load, so a
// missing file degrades gracefully to a public sample instead of a blank scene.
// ---------------------------------------------------------------------------

export const AVATAR_URL =
  process.env.NEXT_PUBLIC_AVATAR_URL || "/models/Avatar.glb";

// Optional separate animation GLB holding a walk clip. Drop a free Mixamo
// "Walking" export here (any GLB whose clip drives the standard humanoid bones)
// and it's used automatically — mixamorig: prefixes and root motion are stripped
// on load. If the file is missing, the built-in procedural walk is used instead.
export const ANIMATIONS_URL =
  process.env.NEXT_PUBLIC_ANIMATIONS_URL || "/models/animations.glb";

// --- Locomotion speed -------------------------------------------------------
// The avatar WALKS the trail by default; holding Shift (or the HUD toggle)
// breaks it into a jog. Two gaits, two loops.
//
// THE ONE RULE HERE: the world must carry the avatar at exactly the speed its
// legs are pushing, or the feet skate. So ground speed is DERIVED from the
// clips rather than set independently — the two can't drift apart again.
//
// The native figures are measured, not guessed: drive the Avaturn rig with each
// clip and watch the stance foot. While a foot is planted its velocity in the
// pelvis frame is exactly minus the body's ground velocity, which makes the
// clip's own speed directly readable (scratchpad `walkmeas.mjs`; re-measure if
// you ever swap a gait clip).
//
// RE-MEASURED under NATIVE binding when the loops went native (2026-07-25): with
// the pelvis kept (not dropped) the stance foot must be read in the fixed SCENE
// frame, not the now-rotating pelvis frame (scratchpad `walk_native.mjs` /
// `fastrun_measure.mjs`). The walk is 1.74 (it barely sways). The Shift gait is
// now the FAST run (fast-run.glb, `FastRun`) at its NATIVE ground speed 4.51 m/s
// — it leans 9–23°, stance foot read in the scene frame like the walk. (For
// reference the dropped slow-run jog measured 2.42 native, 2.58 hips-local.)
// Speeds MUST stay on the native basis or the feet skate.
export const LOCO_NATIVE_MS = { walk: 1.74, run: 4.51 }; // m/s at timeScale 1, native binding

// Playback rate of each loop — the knob for how brisk each gait feels. Raise it
// and WALK_SPEED / SPRINT_MULT follow automatically, so the feet keep gripping
// whatever you pick. The walk past ~1.4 looks hurried. The run is 1.0 = the
// FastRun clip at its authored rate (a clean ~2× walk sprint, 4.51 m/s); nudge
// toward 1.2–1.3 for a faster sprint (stays skate-free), but sped up too far a
// fast-run windmills.
export const LOCO_TIME_SCALE = { walk: 1.3, run: 1.0 };

// buildWalkCurve().getLength() — the GRAND TOUR (start → The Arc → Town Gate →
// Pond Bridge → Experience → Crossroads → Skills → Ask → Summit). Measured
// once, since config can't import the curve (curve.ts reads this file).
// Re-measure if the road network changes (scratchpad len.ts).
export const TRAIL_METRES = 407;

export const WALK_MS = LOCO_NATIVE_MS.walk * LOCO_TIME_SCALE.walk; // 2.26 m/s
export const RUN_MS = LOCO_NATIVE_MS.run * LOCO_TIME_SCALE.run; // 4.51 m/s (the Shift run)

// Where in a gait cycle a foot actually strikes, as a phase offset for the body
// bob (measured the same way — the lower foot's height minima). TWO strikes per
// clip cycle, so the bob phase advances one 2π turn per cycle and |sin| dips
// exactly twice; the dip must bottom out ON the strike or it reads as a limp.
// walk footfalls land at clip fraction 0.215/0.690, the fast run's at 0.390/0.845.
export const WALK_BOB_PHASE = 1.87;
export const RUN_BOB_PHASE = 0.83;

// --- Motion library ---------------------------------------------------------
// Every clip is a Mixamo FBX run through `scripts/fbx_to_anim_glb.py`, which
// strips the character mesh — a 5 MB FBX becomes a ~60 KB clip-only GLB on the
// same 53-bone skeleton. `hint` picks the clip out of its file by name.
export const MOTION = {
  walk: { url: "/models/walk.glb", hint: "walk" },
  run: { url: "/models/fast-run.glb", hint: "run" }, // the Shift-held run (FastRun clip; slow-run.glb now unused)
  throw: { url: "/models/throw.glb", hint: "throw" }, // pelting a snowman
  leap: { url: "/models/big-leap.glb", hint: "leap" },
  bigJump: { url: "/models/big-jump.glb", hint: "jump" },
  jumpUp: { url: "/models/jumping-up.glb", hint: "jump" },
  // Broken export — only the Hips bone animates (no legs/arms). Excluded from
  // CORE_MOTIONS + KICK_MOVES; re-export from Mixamo to restore. See KICK_MOVES.
  kickHurricane: { url: "/models/hurricane-kick.glb", hint: "kick" },
  kickRoundhouse: { url: "/models/roundhouse-kick.glb", hint: "kick" },
  kickMma: { url: "/models/mma-kick.glb", hint: "kick" },
  kickSide: { url: "/models/side-kick.glb", hint: "kick" },
  dance1: { url: "/models/dance-1.glb", hint: "dance" },
  dance2: { url: "/models/dance-2.glb", hint: "dance" },
  dance3: { url: "/models/dance-3.glb", hint: "dance" },
  danceFinish: { url: "/models/dance-finish.glb", hint: "dance" },
} as const;

export type MotionName = keyof typeof MOTION;

// Loaded up front (the moves a visitor can hit within seconds of arriving).
export const CORE_MOTIONS: MotionName[] = [
  "walk", "run", "throw", "leap", "bigJump", "jumpUp",
  "kickRoundhouse", "kickMma", "kickSide", // kickHurricane excluded — broken export (see KICK_MOVES)
];
// Fetched on first use — the dances are the big files (up to 312 KB) and nothing
// can trigger one until a game has been won.
export const LAZY_MOTIONS: MotionName[] = ["dance1", "dance2", "dance3", "danceFinish"];

// Substrings used to pick clips out of the avatar / animation GLBs by name.
export const IDLE_CLIP_HINT = "idle"; // Avaturn export: "IdleV4.2(...)"
export const WALK_CLIP_HINT = "walk"; // Mixamo export: "Walking" / "mixamo.com"

// --- Obstacle moves ---------------------------------------------------------
// Meeting an obstacle alternates between kicking it clear and going over it, so
// the seven obstacles on the trail never play the same beat twice running.
//
// `impact` is how far through the clip the foot connects (the obstacle launches
// on that frame). Kicks now play NATIVELY (retargetNative in Avatar.tsx), so each
// clip carries its OWN body rotation — a real roundhouse/side pivot that winds up
// and ends back on its starting facing. That's why `spin` (an extra whole-body
// turn added at the object level) is 0 for all of them: the old non-zero value
// existed only to fake motion back after the retarget dropped the pelvis, which
// was also what made the legs swing wrong. Set it non-zero again only to ADD a
// flourish on top of a clip that doesn't turn enough on its own.
//
// kickHurricane is intentionally absent: its FBX→GLB export is degenerate — only
// the Hips bone animates (177°), every leg/arm/spine track is flat 0°, so there
// is no kick in the file (the old fake spin was hiding that). Re-export it from
// Mixamo, then re-add it here and to CORE_MOTIONS to bring back a fourth kick.
export const KICK_MOVES: { clip: MotionName; impact: number; spin: number }[] = [
  { clip: "kickRoundhouse", impact: 0.5, spin: 0 },
  { clip: "kickMma", impact: 0.5, spin: 0 },
  { clip: "kickSide", impact: 0.5, spin: 0 },
];

// Every kick is retimed to this long, so a slow clip (roundhouse is 2.53 s) does
// not strand the runner mid-trail while a fast one looks rushed.
export const KICK_SECONDS = 1.7;

// The snowball throw. The mocap is a leisurely 4.9 s (wind-up → throw → settle);
// retimed to THROW_SECONDS so the toss feels responsive, with the snowball
// leaving the hand at THROW_RELEASE of the retimed clip (measured: peak hand
// speed at clip fraction 0.53). See Snowballs.tsx / the "throw" move in game.ts.
export const THROW_SECONDS = 1.8;
export const THROW_RELEASE = 0.53;

// The avatar halts this far short of an obstacle (metres) to kick it, so the
// spinning leg connects instead of the body passing through the mesh.
export const KICK_STOP_LEAD = 1.9;

// Vaults. `v0` is the launch velocity fed to the shared jump integrator; apex =
// v0²/(2·GRAVITY), so 5.6 clears a log (0.42 m radius) and 7.6 gets over a rock
// (0.85 m plus its snow cap). The clip is retimed to the hop's airtime, so the
// legs are tucked while the avatar is actually off the ground.
export const VAULT_MOVES: Record<"log" | "rock", { clip: MotionName; v0: number }> = {
  log: { clip: "leap", v0: 5.6 },
  rock: { clip: "bigJump", v0: 7.6 },
};

// Dances, played when a visitor wins something. Rotated in order so repeat wins
// don't repeat the same routine; the breakdance is saved for the best results.
export const DANCE_MOVES: MotionName[] = ["dance1", "dance2", "dance3"];
export const DANCE_FINISH: MotionName = "danceFinish";

// --- Sprint -----------------------------------------------------------------
// Holding Shift (or the HUD toggle) crossfades the walk loop into the run loop,
// so the world speed-up is simply the ratio of the two clips' ground speeds —
// 4.51 / 2.26 = 1.99×. Derived, again, so accelerating can never start the feet
// skating.
export const SPRINT_MULT = RUN_MS / WALK_MS;

// Procedural-walk gait tuning (used only when no walk clip is present). If limbs
// swing sideways instead of forward on your rig, flip the axis letters below.
export const WALK = {
  cadence: 1.6, // steps per second
  legSwing: 0.6, // hip flexion amplitude (rad)
  kneeBend: 0.9, // knee flexion during swing (rad)
  footRoll: 0.3, // ankle roll (rad)
  armSwing: 0.45, // shoulder swing (rad)
  elbowBend: 0.25, // forearm bend (rad)
  hipSway: 0.08, // pelvis roll side-to-side (rad)
  hipTwist: 0.1, // pelvis yaw lead (rad)
  torsoTwist: 0.13, // spine counter-rotation (rad)
  bob: 0.06, // vertical body bob (world units)
  lean: 0.05, // forward lean (rad)
  clipTimeScale: 1.0, // playback rate of an external walk clip
};

// Optional remote sample used only if the local avatar fails to load. Empty by
// default: an unreachable external host would throw an ugly uncaught fetch error
// (and many deploy/dev environments have no egress), so we degrade straight to
// the built-in capsule walker instead. Set NEXT_PUBLIC_AVATAR_FALLBACK to a
// reachable GLB URL to re-enable a hosted fallback.
export const REMOTE_AVATAR_FALLBACK = process.env.NEXT_PUBLIC_AVATAR_FALLBACK || "";

// GLTF humanoid avatars face +Z, and atan2(dir.x, dir.z) already turns that to
// face the travel direction — so 0 is correct here. If your avatar ever walks
// backwards (face toward the camera), set this to Math.PI.
export const AVATAR_FACING_OFFSET = 0;

// World scale ---------------------------------------------------------------
// The trail runs from the camera's starting spot (near z ≈ 0) off into the
// distance along -Z, meandering in X and climbing as it goes.
export const TRAIL_LENGTH = 260; // world units from start to summit
export const TERRAIN_HALF_X = 170; // terrain spans [-X, +X]
export const TERRAIN_Z_NEAR = 64; // terrain extends this far toward/behind the start — enough that the opening camera never sees past the world's near edge into empty sky
export const TERRAIN_Z_FAR = -300; // ...and this far into the distance
export const TERRAIN_SEGMENTS = 120; // heightmap resolution per side (chunkier facets for the low-poly read)

// Path carving --------------------------------------------------------------
export const TRAIL_HALF_WIDTH = 3.0; // flat walking surface half-width
export const TRAIL_BLEND = 6.0; // soft shoulder that blends back into terrain

// Zone boundaries measured in -Z (further = higher = wilder).
// meadow → forest → mountain. Retuned for the compact hub map: the town, pond
// and Experience road are meadow; the Crossroads/Skills belt is forest; Ask and
// the Summit knoll sit in the mountain band.
export const ZONE_FOREST_START = -40;
export const ZONE_MOUNTAIN_START = -110;

// The pond at the town's south-east gate. The basin is carved into the terrain
// (see terrain.ts) and filled with an animated water plane (Water.tsx). The
// road to Experience crosses it on the timber BRIDGE below; the curling sheet
// lives on the ice just south of the deck.
export const POND = {
  x: 28,
  z: -30,
  radius: 10, // water radius
  blend: 6, // basin rim that rises back to ground level
  depth: 1.8, // how far the floor sits below surrounding ground
};

// THE POND BRIDGE — a straight timber deck spanning the pond on the Experience
// road. The west abutment IS the path graph's "waterfront" junction (graph.ts
// ties the node to ax/az), terrain.walkHeight() folds the deck profile into the
// walkable ground, and Bridge.tsx builds the structure from this same spec — so
// the road, the ground the avatar walks, and the timber can never drift apart.
// Coordinates are the audited ones (design_map.ts): aprons just off the
// waterline, deck edge ≥1.5 m clear of the curling sheet.
export const BRIDGE = {
  ax: 19.0, // west abutment (the Waterfront junction)
  az: -24.5,
  bx: 37.2, // east abutment
  bz: -24.5,
  halfW: 2.7, // deck half-width (just proud of the walked ribbon)
  deckClear: 0.55, // deck height over the water at the abutments
  arch: 0.45, // extra rise at mid-span
  apron: 4.0, // ramp length blending road level up to deck level
};

// The curling sheet, moved to the pond's south lobe so the bridge crosses the
// north half. Hack (throwing spot) west, house/button east.
export const CURL_SHEET = { hackX: 20.5, hackZ: -33, buttonX: 32, buttonZ: -32.5 };

// Social destinations around the town square (SocialSignposts.tsx). Email and
// WhatsApp are built from the profile in content/resume.json.
// TODO(user): paste the real profile URLs for these two.
export const LINKEDIN_URL = "https://www.linkedin.com/in/sujitpranav/";
export const GITHUB_URL = "https://github.com/iamsujitpranav/";

// Movement ------------------------------------------------------------------
// Fraction of the full curve per second. DERIVED from the walk clip (see the
// locomotion block at the top) — the trail is 334 m, so 2.26 m/s is 0.0068/s,
// about 148 s end to end and ~27 s between neighbouring stops; holding Shift
// runs it (×SPRINT_MULT ≈ 2.0) to ~74 s / ~13 s. Deriving it from the clip is what
// keeps the feet gripping instead of skating — raise LOCO_TIME_SCALE.walk to
// pick up the pace and WALK_SPEED follows automatically.
export const WALK_SPEED = WALK_MS / TRAIL_METRES;
export const ARRIVE_EPS = 0.0025; // "close enough" to a waypoint

// Rendering / atmosphere ----------------------------------------------------
export const TONEMAP_EXPOSURE = 1.05; // ACES filmic exposure
export const FOG_DENSITY = 0.0046; // exponential fog — thick enough to melt the far edge into a warm haze (was 0.0038, world "ended" into white)

// Colors (sampled to feel cohesive with the site's warm palette) ------------
// Golden-hour palette — warm, hazy, distinct from Bruno's bright primaries.
// These now drive a stylized gradient sky dome (SkyDome.tsx): a warm gold horizon
// rising to a dusky periwinkle zenith, with the fog matched to the horizon so the
// distance melts seamlessly into the sky.
export const SKY_TOP = "#6d74a6"; // dusky warm periwinkle at the zenith
export const SKY_HORIZON = "#f4b877"; // warm gold at the horizon (near the sun)
export const SKY_SUN = "#ffe6b0"; // sun-glow tint bloomed into the horizon
export const FOG_COLOR = "#e0e9f3"; // cool white winter haze (day) — snow melts to white, never amber. The day/night cycle drives the live fog colour (see daynight.ts); this is just the first-frame seed.
export const GRASS_LOW = "#7e8a45";
export const GRASS_HIGH = "#657337";
export const DIRT = "#a9824c";
export const TRAIL_COLOR = "#bd9457"; // packed-earth path
export const ROCK = "#867a68";
export const SNOW = "#f4ecd9"; // warm, not blue-white
