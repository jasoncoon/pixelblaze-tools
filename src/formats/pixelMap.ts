// Ported from neoimage www/src/formats/pixelMap.ts.

const PIXEL_MAP_VERSION = 2;

export interface DecodedPixelMap {
  /** A point per pixel, each coordinate a 16-bit unsigned fraction of the mapped extent. */
  points: number[][];
  dimensions: number;
}

/** `/pixelmap.dat`: a 3-word header (version, dimensions, byte length), then row-major uint16s. */
export function decodePixelMap(bytes: Uint8Array): DecodedPixelMap {
  if (bytes.byteLength < 12) throw new Error("pixel map truncated");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(0, true);
  if (version !== PIXEL_MAP_VERSION) throw new Error(`unsupported pixel map version ${version}`);

  const dimensions = view.getUint32(4, true);
  const byteLength = view.getUint32(8, true);
  if (12 + byteLength > bytes.byteLength) throw new Error("pixel map truncated");

  // A device with no map stores a header and nothing else, dimensions included.
  if (dimensions === 0 || byteLength === 0) return { points: [], dimensions };

  const points: number[][] = [];
  for (let offset = 12; offset + dimensions * 2 <= 12 + byteLength; offset += dimensions * 2) {
    const point: number[] = [];
    for (let dim = 0; dim < dimensions; dim++) point.push(view.getUint16(offset + dim * 2, true));
    points.push(point);
  }

  return { points, dimensions };
}
