"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

const GLYPHS = "01ABCDEFGHIJKLMNOPQRSTUVWXYZ{}[]<>/\\|:+-=*#_";
const REVEAL_SECONDS = 3.4;
const DESIGN_WIDTH = 1200;
const TEXTURE_WIDTH = 3200;

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function phase(elapsed: number, start: number, duration: number) {
  return clamp((elapsed - start) / duration);
}

function scramble(text: string, progress: number, tick: number, seed: number) {
  if (progress >= 1) return text;
  const settled = Math.floor(text.length * clamp((progress - 0.25) / 0.75));
  return [...text].map((character, index) => {
    if (/\s/.test(character)) return character;
    if (index < settled) return character;
    return GLYPHS[(index * 17 + tick * 7 + seed * 23) % GLYPHS.length];
  }).join("");
}

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawRain(context: CanvasRenderingContext2D, width: number, height: number, tick: number) {
  context.save();
  context.font = "600 24px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let column = 0, x = 25; x < width; column += 1, x += 34) {
    const length = 4 + ((column * 5) % 8);
    const start = -50 + ((column * 97 + tick * 11) % (height + 130));
    for (let row = 0; row < length; row += 1) {
      const fade = 1 - row / length;
      context.fillStyle = `rgba(25, 255, 114, ${0.025 + fade * 0.11})`;
      context.fillText(
        GLYPHS[(column * 13 + row * 17 + tick) % GLYPHS.length],
        x,
        (start + row * 29) % (height + 60) - 20,
      );
    }
  }
  context.restore();
}

function formingText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  progress: number,
  tick: number,
  seed: number,
  color: string,
) {
  const current = scramble(text, progress, tick, seed);
  if (progress < 1) {
    context.save();
    context.shadowBlur = 0;
    context.fillStyle = "rgba(25, 255, 114, 0.18)";
    context.fillText(scramble(text, progress, tick - 1, seed + 3), x, y + 9);
    context.fillStyle = "rgba(25, 255, 114, 0.08)";
    context.fillText(scramble(text, progress, tick - 2, seed + 6), x, y + 18);
    context.restore();
  }
  context.save();
  context.shadowBlur = 0;
  context.lineJoin = "round";
  context.lineWidth = 2.5;
  context.strokeStyle = "rgba(0, 6, 3, 0.98)";
  context.strokeText(current, x, y);
  context.restore();
  context.fillStyle = color;
  context.fillText(current, x, y);
}

function drawSign(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  title: string,
  subtitle: string | undefined,
  action: string,
  system: string,
  elapsed: number,
  tick: number,
  active: boolean,
  titleFontSize?: number,
) {
  // Draw with the original 1200px layout coordinates onto a denser backing
  // canvas. This keeps every typographic proportion unchanged while giving
  // the GPU more glyph detail during camera close-ups.
  const pixelScale = canvas.width / DESIGN_WIDTH;
  const width = canvas.width / pixelScale;
  const height = canvas.height / pixelScale;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.scale(pixelScale, pixelScale);
  const background = context.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#031109");
  background.addColorStop(0.5, "#010704");
  background.addColorStop(1, "#020d07");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  drawRain(context, width, height, tick);

  context.fillStyle = "rgba(0, 0, 0, 0.14)";
  for (let y = 2; y < height; y += 7) context.fillRect(0, y, width, 1);

  context.shadowColor = "#19ff72";
  context.shadowBlur = active ? 22 : 12;
  context.strokeStyle = active ? "rgba(83, 255, 148, 0.98)" : "rgba(25, 255, 114, 0.78)";
  context.lineWidth = 7;
  context.strokeRect(13, 13, width - 26, height - 26);
  context.shadowBlur = 0;
  context.strokeStyle = "rgba(25, 255, 114, 0.25)";
  context.lineWidth = 2;
  context.strokeRect(27, 27, width - 54, height - 54);

  context.textAlign = "left";
  context.textBaseline = "middle";
  context.font = "700 26px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  formingText(context, `// ${system}`, 48, height * 0.14, phase(elapsed, 0, 0.72), tick, 1, "#4dff98");
  context.textAlign = "right";
  formingText(context, "ONLINE [01]", width - 48, height * 0.14, phase(elapsed, 0.08, 0.78), tick, 2, "#20c969");

  context.textAlign = "center";
  const titleSize = titleFontSize ?? (title.length > 22 ? 58 : title.length > 14 ? 68 : 82);
  context.font = `800 ${titleSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  context.shadowColor = "#19ff72";
  context.shadowBlur = 3;
  formingText(context, title, width / 2, height * (subtitle ? 0.38 : 0.46), phase(elapsed, 0.16, 1.25), tick, 4, "#c9ffda");
  context.shadowBlur = 0;

  if (subtitle) {
    context.font = "700 36px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const lines = wrapLines(context, subtitle, width - 150).slice(0, 2);
    lines.forEach((line, index) => formingText(
      context,
      `> ${line}`,
      width / 2,
      height * 0.6 + index * 45,
      phase(elapsed, 0.58 + index * 0.12, 1.48),
      tick,
      10 + index,
      "#79ffab",
    ));
  }

  const dividerY = height * 0.79;
  context.strokeStyle = "rgba(25, 255, 114, 0.38)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(55, dividerY);
  context.lineTo(width - 55, dividerY);
  context.stroke();

  context.font = "800 30px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  formingText(context, `[ ENTER // ${action} ]`, width / 2, height * 0.9, phase(elapsed, 1.08, 1.42), tick, 20, "#a4ffc4");
  context.restore();
}

export default function MatrixSignFace({
  width,
  height,
  title,
  subtitle,
  action,
  system = "TRAIL_ACCESS",
  active = false,
  titleFontSize,
}: {
  width: number;
  height: number;
  title: string;
  subtitle?: string;
  action: string;
  system?: string;
  active?: boolean;
  titleFontSize?: number;
}) {
  const [surface] = useState(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = TEXTURE_WIDTH;
    canvas.height = Math.max(360, Math.round(canvas.width * (height / width)));
    const context = canvas.getContext("2d");
    if (!context) return null;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 16;
    drawSign(context, canvas, title, subtitle, action, system, 0, 0, active, titleFontSize);
    texture.needsUpdate = true;
    return { canvas, context, texture };
  });
  const animation = useRef({ elapsed: 0, accumulator: 0, tick: 0, complete: false });

  useEffect(() => {
    if (!surface) return;
    animation.current = { elapsed: 0, accumulator: 0, tick: 0, complete: false };
    drawSign(surface.context, surface.canvas, title, subtitle, action, system, 0, 0, active, titleFontSize);
    surface.texture.needsUpdate = true;
  }, [active, action, subtitle, surface, system, title, titleFontSize]);

  useFrame((_, delta) => {
    if (!surface || animation.current.complete) return;
    const state = animation.current;
    state.elapsed = Math.min(REVEAL_SECONDS, state.elapsed + delta);
    state.accumulator += delta;
    if (state.accumulator < 1 / 12 && state.elapsed < REVEAL_SECONDS) return;
    state.accumulator = 0;
    state.tick += 1;
    drawSign(surface.context, surface.canvas, title, subtitle, action, system, state.elapsed, state.tick, active, titleFontSize);
    surface.texture.needsUpdate = true;
    if (state.elapsed >= REVEAL_SECONDS) state.complete = true;
  });

  useEffect(() => () => surface?.texture.dispose(), [surface]);
  if (!surface) return null;

  return (
    // Billboarded signs can be viewed from angles where a centred support
    // post reaches slightly past the board's shallow box. Keep the emissive
    // face far enough forward that the pole always remains behind the text.
    <mesh position={[0, 0, 0.12]} renderOrder={2}>
      <planeGeometry args={[width * 0.96, height * 0.9]} />
      <meshBasicMaterial
        map={surface.texture}
        toneMapped={false}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}
