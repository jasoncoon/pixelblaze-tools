/**
 * The device's pixel map, as a backup stores it, ready for drawing a pattern preview on.
 * Only `/pixelmap.dat` is used: it is what the device itself runs from, already normalized,
 * whereas `/pixelmap.txt` may be a mapping function rather than coordinates.
 */

import type { DecodedBackup } from "./decode.ts";

/** Below this a dimension would collapse to a hairline; matches neoimage's mapper. */
const MIN_RATIO = 0.01;

export interface PreviewMap {
  /** One point per pixel, each coordinate a 16-bit fraction of the mapped extent. */
  points: number[][];
  dimensions: number;
  /** Smallest dimension's extent relative to the largest, which sizes the dots. */
  smallestRatio: number;
  /** Pixels the device drives, which the preview's columns are spread across. */
  pixelCount: number;
}

export function backupPixelMap(backup: DecodedBackup): PreviewMap | undefined {
  const file = backup.files.find((f) => f.type === "pixelmapData");
  if (file?.type !== "pixelmapData") return undefined;
  const { points, dimensions } = file.map;
  if (points.length === 0 || dimensions === 0) return undefined;

  const config = backup.files.find((f) => f.path === "/config.json");
  const configured = config?.type === "json" ? (config.value as { pixelCount?: unknown } | null)?.pixelCount : undefined;
  const pixelCount = typeof configured === "number" && configured > 0 ? configured : points.length;

  return { points, dimensions, smallestRatio: smallestRatio(points, dimensions), pixelCount };
}

function smallestRatio(points: number[][], dimensions: number): number {
  const extents: number[] = [];
  for (let d = 0; d < dimensions; d++) {
    let min = Infinity;
    let max = -Infinity;
    for (const p of points) {
      min = Math.min(min, p[d]);
      max = Math.max(max, p[d]);
    }
    extents.push(max - min);
  }
  const largest = Math.max(...extents);
  if (largest === 0) return 1;
  return Math.max(MIN_RATIO, Math.min(...extents) / largest);
}

/**
 * The preview column showing pixel `index`. A preview narrower than the strip (an old 100-wide
 * one, or a strip that has grown since) spreads its columns across the pixels.
 */
export function previewColumn(index: number, columns: number, pixelCount: number): number {
  return Math.min(columns - 1, Math.floor(((index + 0.5) * columns) / Math.max(1, pixelCount)));
}
