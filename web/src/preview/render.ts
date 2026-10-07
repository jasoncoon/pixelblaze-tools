/**
 * Draws one frame of a pattern preview: as a strip, one cell per preview column, or on the
 * device's pixel map, one glowing dot per mapped pixel. The map drawing follows neoimage's
 * www/src/app/ui/mapPreviewRender.ts (dot sizing, glow, the 1D spiral, the 3D projection and
 * slow spin) so a map looks the same here as in the device's own UI.
 */

import { previewColumn, type PreviewMap } from "../../../src/backup/pixelMap.ts";
import type { PreviewFrames } from "./frames.ts";

/** A dot this narrow or less is drawn as a solid cell; a circle would be lost. */
const MIN_DOT_PX = 5;

export function drawStrip(canvas: HTMLCanvasElement, frames: PreviewFrames, frame: number): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width: w, height: h } = canvas;
  context.fillStyle = "#000";
  context.fillRect(0, 0, w, h);

  const cell = w / frames.width;
  const row = frame * frames.width * 4;
  for (let x = 0; x < frames.width; x++) {
    const at = row + x * 4;
    context.fillStyle = `rgb(${frames.data[at]} ${frames.data[at + 1]} ${frames.data[at + 2]})`;
    if (cell >= MIN_DOT_PX) {
      context.beginPath();
      context.arc((x + 0.5) * cell, h / 2, Math.min(cell, h) * 0.42, 0, Math.PI * 2);
      context.fill();
    } else {
      // Rounded out to whole device pixels so neighbouring cells do not leave seams.
      const left = Math.floor(x * cell);
      context.fillRect(left, 0, Math.ceil((x + 1) * cell) - left, h);
    }
  }
}

// Map drawing happens in a fixed square of VIEW units, scaled to the canvas.
const VIEW = 266;
const MARGIN = 5;
const CENTER = 128;
const MODEL_SCALE = 0.8;
const FOCAL_LENGTH = 384;
const DOT_SCALE_2D = 425;
const DOT_SCALE_3D = 512;
const DOT_MID_2D = [0.4, 0.8];
const DOT_MID_3D = [0.15, 0.25];
const SCALE_POW = 1.5;
const AUTO_ROTATE_X = Math.PI * 1.2;
const SPIN_X_PERIOD_MS = 20000;
const SPIN_Z_PERIOD_MS = 25000;
/** Mapped pixels the preview's columns do not reach, drawn dim rather than left out. */
const UNLIT = "rgba(64, 64, 64, 1)";

export function drawMap(canvas: HTMLCanvasElement, frames: PreviewFrames, frame: number, map: PreviewMap, now: number): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.resetTransform();
  context.scale(canvas.width / VIEW, canvas.height / VIEW);
  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#000";
  context.fillRect(0, 0, VIEW, VIEW);

  const { points, dimensions, smallestRatio, pixelCount } = map;
  const row = frame * frames.width * 4;
  const color = (index: number, alpha: number) => {
    if (index >= pixelCount) return UNLIT;
    const at = row + previewColumn(index, frames.width, pixelCount) * 4;
    return `rgba(${frames.data[at]}, ${frames.data[at + 1]}, ${frames.data[at + 2]}, ${alpha})`;
  };
  const dotScale = (Math.sqrt(smallestRatio) * dimensions) / 2 / Math.sqrt(points.length);

  if (dimensions >= 3) {
    const rotateX = AUTO_ROTATE_X + Math.sin((Math.PI * 2 * (now % SPIN_X_PERIOD_MS)) / SPIN_X_PERIOD_MS) / 3;
    const rotateZ = (Math.PI * 2 * (now % SPIN_Z_PERIOD_MS)) / SPIN_Z_PERIOD_MS;
    const dotWidth = DOT_SCALE_3D * dotScale;
    drawAxes(context, rotateX, rotateZ);
    context.globalCompositeOperation = "lighter";
    points.forEach((p, i) => {
      const [x, y, depth] = project(p[0] / 256, p[1] / 256, p[2] / 256, rotateX, rotateZ);
      drawDot(context, x, y, dotWidth * Math.pow(depth, SCALE_POW), DOT_MID_3D, (alpha) => color(i, alpha));
    });
    return;
  }

  const dotWidth = DOT_SCALE_2D * dotScale;
  const span = Math.max(0, VIEW - 2 * MARGIN - dotWidth);
  const offset = MARGIN + dotWidth / 2;
  context.globalCompositeOperation = "lighten";
  points.forEach((p, i) => {
    const [x, y] =
      dimensions === 1 ? spoolCoordinate(p, points.length) : [(p[0] / 65535) * span + offset, (p[1] / 65535) * span + offset];
    drawDot(context, x, y, dotWidth, DOT_MID_2D, (alpha) => color(i, alpha));
  });
}

function drawDot(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  mid: readonly number[],
  color: (alpha: number) => string,
): void {
  const gradient = context.createRadialGradient(x, y, 0, x, y, width / 2);
  gradient.addColorStop(0, color(1));
  gradient.addColorStop(mid[0], color(mid[1]));
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(x - width / 2, y - width / 2, width, width);
}

/** A 1D map laid on an Archimedean spiral, so a long strip fills the square. */
function spoolCoordinate(point: number[], count: number): [number, number] {
  const spacing = Math.sqrt(count);
  const b = 1 - point[0] / 65535 + 0.1;
  const t = 2 * Math.PI * Math.sqrt((2 * spacing) / b);
  const a = -b * t;
  const r = (a * 13) / Math.sqrt(spacing);
  return [Math.cos(a) * r + CENTER + MARGIN, Math.sin(a) * r + CENTER + MARGIN];
}

/** Rotates about the middle of the world and applies perspective; returns x, y, depth scale. */
function project(x: number, y: number, z: number, rotateX: number, rotateZ: number): [number, number, number] {
  const mx = (x - CENTER) * MODEL_SCALE;
  const my = (y - CENTER) * MODEL_SCALE;
  const mz = (z - CENTER) * MODEL_SCALE;
  const zx = Math.cos(rotateZ) * mx + Math.sin(rotateZ) * my;
  const zy = -Math.sin(rotateZ) * mx + Math.cos(rotateZ) * my;
  const ry = Math.cos(rotateX) * zy + Math.sin(rotateX) * mz;
  const rz = -Math.sin(rotateX) * zy + Math.cos(rotateX) * mz;
  const scale = FOCAL_LENGTH / (rz + CENTER + FOCAL_LENGTH);
  return [zx * scale + CENTER, ry * scale + CENTER, scale];
}

/** x, y and z drawn from the origin corner, so a spinning cloud of dots has a sense of which way is which. */
function drawAxes(context: CanvasRenderingContext2D, rotateX: number, rotateZ: number): void {
  const axis = (to: readonly number[], color: string, label: string) => {
    const start = project(0, 0, 0, rotateX, rotateZ);
    const end = project(to[0], to[1], to[2], rotateX, rotateZ);
    context.lineWidth = 1;
    context.strokeStyle = color;
    context.beginPath();
    context.moveTo(start[0], start[1]);
    context.lineTo(end[0], end[1]);
    context.stroke();
    const at = project(to[0] * 1.1, to[1] * 1.1, to[2] * 1.1, rotateX, rotateZ);
    context.fillStyle = color;
    context.font = "bold 12px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, at[0], at[1]);
  };
  axis([CENTER, 0, 0], "red", "x");
  axis([0, CENTER, 0], "green", "y");
  axis([0, 0, CENTER], "blue", "z");
}
