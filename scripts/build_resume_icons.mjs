/**
 * Rasterize the résumé icon set (scripts/resume_icons/svg) into PNGs that
 * build_recruiter_resume.py embeds in the PDF. reportlab cannot read SVG, so the
 * generated PNGs are committed and only need rebuilding when an SVG changes.
 *
 *   node scripts/build_resume_icons.mjs
 */

import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVG_DIR = path.join(ROOT, "scripts", "resume_icons", "svg");
const PNG_DIR = path.join(ROOT, "scripts", "resume_icons", "png");

// ~10pt icons printed at 300dpi-ish density, so they stay crisp when zoomed.
const SIZE = 128;

const files = (await readdir(SVG_DIR)).filter((file) => file.endsWith(".svg")).sort();
await mkdir(PNG_DIR, { recursive: true });

for (const file of files) {
  const name = path.basename(file, ".svg");
  await sharp(path.join(SVG_DIR, file), { density: 600 })
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(PNG_DIR, `${name}.png`));
  console.log(`icon: ${name}.png`);
}

console.log(`${files.length} icons written to ${path.relative(ROOT, PNG_DIR)}`);
