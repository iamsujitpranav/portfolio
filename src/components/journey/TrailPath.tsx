"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Billboard, useCursor } from "@react-three/drei";
import { walkHeight } from "@/lib/journey/terrain";
import { fbm, lerp, smoothstep } from "@/lib/journey/noise";
import { TRAIL_HALF_WIDTH } from "@/lib/journey/config";
import { STOPS, STOP_SIGN_OFFSETS, JUNCTION_SIGN_OFFSETS, stopNodeId } from "@/lib/journey/sections";
import type { DisplayFocus } from "./CameraRig";
import { NODES, nodeById, SPINE_EDGE_IDS, VILLAGE_EDGE_IDS } from "@/lib/journey/graph";
import MatrixSignFace from "./MatrixSignFace";

// Cross-section columns (fraction of half-width): true center + soft shoulders,
// so the road can be tinted lighter down the walked middle and darker at its
// damp, grassy verges.
const COLS = [-1, -0.45, 0, 0.45, 1];
// Winter trail: a worn, faintly earthy packed-snow tread down the walked middle,
// fading to clean white snow at the verges.
const CENTER: [number, number, number] = [0.66, 0.63, 0.58]; // trodden packed snow
const EDGE: [number, number, number] = [0.86, 0.88, 0.93]; // clean snow shoulder
// Roads OFF the grand tour read as a DIFFERENT kind of path — a narrower,
// less-trodden lane with a frosty blue-grey tread — so a crossroads on screen
// is visibly several distinct roads, not white-on-white. (In fog an identical
// tint hid the branches.)
const LOOP_CENTER: [number, number, number] = [0.52, 0.6, 0.7];
const LOOP_EDGE: [number, number, number] = [0.78, 0.85, 0.95];

// Sweep the worn packed-snow ribbon along ONE edge curve. Sample count scales
// with the edge's length so short village lanes and the long forest stretches
// get the same ~1 m fidelity.
function buildRibbon(curve: THREE.CatmullRomCurve3, scenic: boolean): THREE.BufferGeometry {
  const N = Math.max(24, Math.round(curve.getLength() * 1.1));
  const COLW = COLS.length;
  const halfW = TRAIL_HALF_WIDTH * (scenic ? 0.68 : 0.95);
  const C = scenic ? LOOP_CENTER : CENTER;
  const E = scenic ? LOOP_EDGE : EDGE;
  const pos: number[] = [];
  const colr: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const perp = new THREE.Vector3();
  const t = new THREE.Vector3();

  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const p = curve.getPointAt(u);
    t.copy(curve.getTangentAt(u)).normalize();
    perp.crossVectors(t, up).normalize();
    for (const f of COLS) {
      const x = p.x + perp.x * halfW * f;
      const z = p.z + perp.z * halfW * f;
      // walkHeight: over the pond the ribbon rides the bridge DECK (the snow
      // tread on the planks), not the basin floor.
      pos.push(x, walkHeight(x, z) + 0.06, z);

      // Center bright and walked, shoulders darker; wear patches along length.
      const across = smoothstep(0.15, 1, Math.abs(f));
      const wear = fbm(u * 26, f * 3, 1) * 0.5 + 0.5;
      const k = (0.86 + wear * 0.3) * 1;
      colr.push(
        lerp(C[0], E[0], across) * k,
        lerp(C[1], E[1], across) * k,
        lerp(C[2], E[2], across) * k,
      );
    }
  }
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < COLW - 1; c++) {
      const a = i * COLW + c;
      const b = i * COLW + c + 1;
      const cc = (i + 1) * COLW + c;
      const d = (i + 1) * COLW + c + 1;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A sign the visitor can click: résumé stops (their marker text), and the
// scenic-loop junctions ("Pond Walk" / "Ridge Lookout") that steer the walk
// down a branch. dx/dz nudge the post off the path shoulder.
type Sign = {
  id: string;
  marker: string;
  sub?: string; // résumé stops: what's waiting there, in plain words
  x: number;
  z: number;
  dx: number;
  dz: number;
  résumé: boolean;
};

function wrappedLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawMatrixRain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  tick: number,
) {
  const glyphs = "01{}[]<>/\\|:+-=*#_ARCHITECT_SYSTEM";
  context.save();
  context.font = "500 31px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (let column = 0, x = 38; x < width; column += 1, x += 48) {
    const streamLength = 5 + ((column * 7) % 11);
    const startY = -70 + ((column * 137 + tick * 13) % (height + 210));
    for (let row = 0; row < streamLength; row += 1) {
      const glyph = glyphs[(column * 13 + row * 17 + tick) % glyphs.length];
      const fade = 1 - row / streamLength;
      context.fillStyle = `rgba(26, 255, 112, ${0.025 + fade * 0.12})`;
      context.fillText(glyph, x, (startY + row * 39) % (height + 90) - 30);
    }
  }
  context.restore();
}

const MATRIX_GLYPHS = "01ABCDEFGHIJKLMNOPQRSTUVWXYZ{}[]<>/\\|:+-=*#_";
const MATRIX_REVEAL_DURATION = 5;

function revealPhase(elapsed: number, start: number, duration: number) {
  return THREE.MathUtils.clamp((elapsed - start) / duration, 0, 1);
}

function scrambledText(text: string, progress: number, tick: number, seed: number) {
  if (progress <= 0) return "";
  if (progress >= 1) return text;

  // Hold a fully scrambled silhouette first, then lock the real copy in from
  // left to right. Spaces remain fixed so the eventual sentence shape is
  // already recognisable while its characters are still raining into place.
  const settle = THREE.MathUtils.clamp((progress - 0.28) / 0.72, 0, 1);
  const settledCharacters = Math.floor(text.length * settle);
  return [...text]
    .map((character, index) => {
      if (character === " ") return " ";
      if (index < settledCharacters) return character;
      return MATRIX_GLYPHS[(index * 17 + tick * 7 + seed * 23) % MATRIX_GLYPHS.length];
    })
    .join("");
}

function drawFormingText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  progress: number,
  tick: number,
  seed: number,
  color: string,
) {
  const current = scrambledText(text, progress, tick, seed);
  if (!current) return;

  if (progress < 1) {
    // Descending translucent copies make the unresolved glyphs feel as though
    // they are dripping down the terminal before snapping into the sentence.
    context.save();
    context.shadowBlur = 0;
    context.fillStyle = "rgba(25, 255, 114, 0.15)";
    context.fillText(scrambledText(text, progress, tick - 1, seed + 3), x, y + 15);
    context.fillStyle = "rgba(25, 255, 114, 0.07)";
    context.fillText(scrambledText(text, progress, tick - 2, seed + 6), x, y + 30);
    context.restore();
  }

  // A dark, non-glowing keyline preserves each glyph's shape after the canvas
  // texture is minified onto the board and the scene bloom is applied. The
  // bright fill can still glow, but its letterforms no longer bleed together.
  context.save();
  context.shadowBlur = 0;
  context.lineJoin = "round";
  context.lineWidth = 3;
  context.strokeStyle = "rgba(0, 5, 2, 0.96)";
  context.strokeText(current, x, y);
  context.restore();

  context.fillStyle = color;
  context.fillText(current, x, y);
}

function drawArchitectBoard(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  elapsed: number,
  tick: number,
) {
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);

  const background = context.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#031109");
  background.addColorStop(0.48, "#010704");
  background.addColorStop(1, "#020d07");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  drawMatrixRain(context, width, height, tick);

  context.fillStyle = "rgba(0, 0, 0, 0.12)";
  for (let yLine = 2; yLine < height; yLine += 8) {
    context.fillRect(0, yLine, width, 1);
  }

  context.fillStyle = "rgba(0, 8, 4, 0.9)";
  context.fillRect(154, 126, width - 308, 648);
  context.strokeStyle = "rgba(25, 255, 114, 0.22)";
  context.lineWidth = 2;
  context.strokeRect(154, 126, width - 308, 648);

  context.shadowColor = "#19ff72";
  context.shadowBlur = 24;
  context.strokeStyle = "rgba(25, 255, 114, 0.86)";
  context.lineWidth = 5;
  context.strokeRect(22, 22, width - 44, height - 44);
  context.shadowBlur = 0;
  context.strokeStyle = "rgba(25, 255, 114, 0.22)";
  context.lineWidth = 2;
  context.strokeRect(39, 39, width - 78, height - 78);

  context.textBaseline = "middle";
  context.textAlign = "left";
  context.font = "700 32px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  drawFormingText(
    context,
    "// ROOT_ACCESS",
    92,
    86,
    revealPhase(elapsed, 0, 0.8),
    tick,
    1,
    "#4dff98",
  );
  context.textAlign = "right";
  drawFormingText(
    context,
    "SYSTEM_ONLINE  [01]",
    width - 92,
    86,
    revealPhase(elapsed, 0.1, 0.9),
    tick,
    2,
    "#20c969",
  );

  context.textAlign = "center";
  context.shadowColor = "#19ff72";
  context.shadowBlur = 4;
  context.font = "800 112px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  drawFormingText(
    context,
    "The Architect",
    width / 2,
    194,
    revealPhase(elapsed, 0.2, 1.35),
    tick,
    3,
    "#c5ffd8",
  );
  context.shadowBlur = 0;

  context.font = "700 52px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const quote = wrappedLines(
    context,
    "Your life is the sum of a remainder of an unbalanced equation.",
    2700,
  );
  quote.forEach((line, index) =>
    drawFormingText(
      context,
      `> ${line}`,
      width / 2,
      308 + index * 64,
      revealPhase(elapsed, 0.9 + index * 0.14, 1.8),
      tick,
      10 + index,
      "#68ffa3",
    ),
  );

  context.font = "650 48px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const bio = wrappedLines(
    context,
    "I don't just build code; I engineer systems. From client-side pixels to deep-learning pipelines, I lead the development of intelligent web ecosystems.",
    2540,
  );
  bio.forEach((line, index) =>
    drawFormingText(
      context,
      line,
      width / 2,
      448 + index * 68,
      revealPhase(elapsed, 1.65 + index * 0.2, 2.35),
      tick,
      20 + index,
      "#edfff3",
    ),
  );

  context.strokeStyle = "rgba(25, 255, 114, 0.42)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(110, 674);
  context.lineTo(width - 110, 674);
  context.stroke();

  context.shadowColor = "#19ff72";
  context.shadowBlur = 2;
  context.font = "800 40px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  drawFormingText(
    context,
    "[ ENTER // CLICK BOARD TO OPEN ]",
    width / 2,
    738,
    revealPhase(elapsed, 3.25, 1.35),
    tick,
    30,
    "#9dffc1",
  );
  context.shadowBlur = 0;
}

/** The Architect face lives in WebGL—not in a DOM <Html> portal—so the avatar
 * can correctly render in front of it through the normal depth buffer. */
function ArchitectBoardFace({
  y,
  active,
  revealText,
}: {
  y: number;
  active: boolean;
  revealText: boolean;
}) {
  const [surface] = useState(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    // Match the 7.56 × 2.11 face exactly. A mismatched canvas aspect ratio made
    // the GPU stretch the terminal horizontally, softening already-small type.
    canvas.width = 3224;
    canvas.height = 900;
    const context = canvas.getContext("2d");
    if (!context) return null;

    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.generateMipmaps = false;
    result.minFilter = THREE.LinearFilter;
    result.magFilter = THREE.LinearFilter;
    result.anisotropy = 16;
    drawArchitectBoard(context, canvas, 0, 0);
    result.needsUpdate = true;
    return { canvas, context, texture: result };
  });

  const animation = useRef({ elapsed: 0, accumulator: 0, tick: 0, complete: false });
  useFrame((_, delta) => {
    // The board clock is deliberately dormant until the avatar's initial
    // materialisation reports ready. This prevents a fast board texture from
    // resolving behind the loading gate and then appearing to restart.
    if (!surface || !revealText || animation.current.complete) return;
    const state = animation.current;
    state.elapsed = Math.min(state.elapsed + delta, MATRIX_REVEAL_DURATION);
    state.accumulator += delta;
    if (state.accumulator < 1 / 12 && state.elapsed < MATRIX_REVEAL_DURATION) return;
    state.accumulator = 0;
    state.tick += 1;
    drawArchitectBoard(surface.context, surface.canvas, state.elapsed, state.tick);
    surface.texture.needsUpdate = true;
    if (state.elapsed >= MATRIX_REVEAL_DURATION) state.complete = true;
  });

  useEffect(() => () => surface?.texture.dispose(), [surface]);
  if (!surface) return null;

  return (
    <mesh
      position={[0.27, y, 0.075]}
      scale={active ? 1.06 : 1}
    >
      <planeGeometry args={[7.56, 2.11]} />
      <meshBasicMaterial map={surface.texture} toneMapped={false} />
    </mesh>
  );
}

// One walked road per PATH-GRAPH edge — the spine and both scenic loops — plus
// the clickable signposts. The ribbons share the avatar's edge curves so
// character and paths can never drift apart.
export default function TrailPath({
  edgeCurves,
  activeId,
  revealRootText,
  showSecondarySigns,
  onPick,
  onDisplay,
}: {
  edgeCurves: Map<string, THREE.CatmullRomCurve3>;
  activeId: string;
  revealRootText: boolean;
  showSecondarySigns: boolean;
  onPick: (id: string) => void;
  onDisplay: (focus: DisplayFocus) => void;
}) {
  const ribbons = useMemo(
    () =>
      [...edgeCurves.entries()]
        // The village lane's geometry IS the side road — SideRoad.tsx already
        // draws that roadbed, so a second coplanar ribbon would z-fight it.
        .filter(([id]) => !VILLAGE_EDGE_IDS.has(id))
        .map(([id, c]) => ({
          id,
          geo: buildRibbon(c, !SPINE_EDGE_IDS.has(id)),
        })),
    [edgeCurves],
  );

  const signs = useMemo<Sign[]>(() => {
    const out: Sign[] = [];
    // Résumé stops keep their marker boards, planted at the stop node. Each
    // stop is now a JUNCTION with roads fanning out, so the classic +2.4 east
    // offset stands in a lane mouth at several of them — the audited per-stop
    // offsets below dodge every incident lane (design_map.ts).
    for (const s of STOPS) {
      // Ask has one interaction point: the terminal screen itself.
      if (s.id === "ask") continue;
      const n = nodeById(stopNodeId(s.id));
      if (!n) continue;
      const [dx, dz] = STOP_SIGN_OFFSETS[s.id] ?? [2.4, 0];
      out.push({ id: s.id, marker: s.marker, sub: s.sub, x: n.x, z: n.z, dx, dz, résumé: true });
    }
    // Junction boards — clickable, they teleport you to that junction: the
    // Village Lane (side road), the Town Gate (4-way) and the Crossroads
    // (5-way). The Pond Bridge junction gets NO board: every clear spot around
    // the abutment is a lane or open water (audited) — the bridge itself is the
    // landmark, and it stays clickable on the trail map.
    for (const n of NODES) {
      if (n.kind !== "junction") continue;
      if (n.id === "cross") continue;
      const off = JUNCTION_SIGN_OFFSETS[n.id];
      if (!off) continue;
      out.push({ id: n.id, marker: n.label ?? n.id, x: n.x, z: n.z, dx: off[0], dz: off[1], résumé: false });
    }
    return out;
  }, []);

  return (
    <group>
      {ribbons.map(({ id, geo }) => (
        <mesh key={id} geometry={geo} receiveShadow>
          <meshStandardMaterial
            vertexColors
            roughness={1}
            metalness={0}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ))}

      {signs.map((s) =>
        s.id !== "start" && !showSecondarySigns ? null : (
          <Signpost
            key={`${s.id}:${s.x.toFixed(0)}`}
            sign={s}
            active={s.id === activeId}
            revealRootText={revealRootText}
            onPick={onPick}
            onDisplay={onDisplay}
          />
        ),
      )}
    </group>
  );
}

function Signpost({
  sign,
  active,
  revealRootText,
  onPick,
  onDisplay,
}: {
  sign: Sign;
  active: boolean;
  revealRootText: boolean;
  onPick: (id: string) => void;
  onDisplay: (focus: DisplayFocus) => void;
}) {
  // Plant the post just off the path shoulder.
  const x = sign.x + sign.dx;
  const z = sign.z + sign.dz;
  const y = walkHeight(x, z);
  const isRoot = sign.id === "start";
  const boardWidth = isRoot ? 7.8 : sign.résumé ? 2.4 : 2.05;
  const boardHeight = isRoot ? 2.35 : sign.résumé ? 0.88 : 0.72;
  // Keep every sign above the avatar's head. At the old 1.5 m anchor, camera
  // perspective could place the active red label directly across the face.
  const boardY = 2.3;
  const postHeight = boardY + boardHeight / 2;
  const [hovered, setHovered] = useState(false);
  useCursor(hovered, "pointer", "auto");
  const choose = () => {
    if (!sign.résumé) {
      onPick(sign.id);
      return;
    }
    const l = Math.hypot(sign.dx, sign.dz) || 1;
    onDisplay({
      id: sign.id,
      x: x + 0.27,
      y: y + boardY,
      z,
      fx: isRoot ? 0 : -sign.dx / l,
      fz: isRoot ? 1 : -sign.dz / l,
    });
  };
  const board = (
    <group
      scale={active ? 1.06 : 1}
      onClick={(event) => { event.stopPropagation(); choose(); }}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh castShadow>
        <boxGeometry args={[boardWidth, boardHeight, 0.09]} />
        <meshStandardMaterial
          color="#020705"
          emissive="#063719"
          emissiveIntensity={active || hovered ? 0.72 : 0.4}
          metalness={0.7}
          roughness={0.34}
        />
      </mesh>
      {!isRoot && (
        <MatrixSignFace
          width={boardWidth}
          height={boardHeight}
          title={sign.marker}
          subtitle={sign.sub}
          action={sign.résumé ? "CLICK BOARD TO OPEN" : "CLICK TO TELEPORT"}
          system={sign.résumé ? "RESUME_ACCESS" : "ROUTE_ACCESS"}
          active={active || hovered}
        />
      )}
    </group>
  );
  return (
    <group position={[x, y, z]}>
      {isRoot && [-2.55, 3.09].map((postX) => (
        <mesh key={postX} position={[postX, postHeight / 2, 0]} castShadow>
          <boxGeometry args={[0.14, postHeight, 0.14]} />
          <meshStandardMaterial
            color="#07110b"
            metalness={0.7}
            roughness={0.38}
          />
        </mesh>
      ))}
      {isRoot ? (
        <group position={[0.27, boardY, 0]}>{board}</group>
      ) : (
        <Billboard position={[0.27, boardY, 0]} follow lockX lockZ>
          <mesh
            position={[-0.27, postHeight / 2 - boardY, -0.12]}
            castShadow
            renderOrder={0}
          >
            <boxGeometry args={[0.1, postHeight, 0.1]} />
            <meshStandardMaterial color="#6b5334" roughness={1} />
          </mesh>
          {board}
        </Billboard>
      )}
      {isRoot ? (
        <ArchitectBoardFace y={boardY} active={active} revealText={revealRootText} />
      ) : null}
    </group>
  );
}
