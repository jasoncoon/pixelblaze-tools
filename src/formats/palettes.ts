// Ported from neoimage www/src/formats/palettes.ts (record reader) and
// www/src/app/stores/systemPalettes.ts (the compiled-in set).

import { fromBase64, fromUtf8 } from "./bytes.ts";

/** `__palette` encoding: system palettes use their ordinal, user palettes this base plus their id. */
export const USER_PALETTE_ID_BASE = 1000;

/** The `__palette` value that cycles the enabled palettes instead of holding one. */
export const PALETTE_CYCLE = -1;

const MAX_PALETTE_STOPS = 16;
const RECORD_HEADER_BYTES = 40;
const NAME_BYTES = 32;
const STOP_BYTES = 16;

export interface PaletteRecord {
  id: number;
  name: string;
  /** Groups of four (pos, r, g, b), each 0..1, flattened. */
  stops: number[];
}

export function decodePaletteRecords(bytes: Uint8Array): PaletteRecord[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records: PaletteRecord[] = [];
  let read = readRecord(bytes, view, 0);
  while (read) {
    records.push(read.record);
    read = readRecord(bytes, view, read.next);
  }
  return records;
}

function readRecord(bytes: Uint8Array, view: DataView, offset: number): { record: PaletteRecord; next: number } | null {
  if (offset + RECORD_HEADER_BYTES > bytes.length) return null;
  const id = view.getUint32(offset, true);
  const nameField = bytes.subarray(offset + 4, offset + 4 + NAME_BYTES);
  const nul = nameField.indexOf(0);
  const name = fromUtf8(nameField.subarray(0, nul < 0 ? NAME_BYTES : nul));
  const declaredStops = view.getUint32(offset + 36, true);
  const stopsOffset = offset + RECORD_HEADER_BYTES;
  const next = stopsOffset + declaredStops * STOP_BYTES;
  if (next > bytes.length) return null;

  const stops: number[] = [];
  for (let g = 0; g < Math.min(declaredStops, MAX_PALETTE_STOPS); g++) {
    const base = stopsOffset + g * STOP_BYTES;
    stops.push(
      clamp01(view.getFloat32(base, true)),
      view.getFloat32(base + 4, true),
      view.getFloat32(base + 8, true),
      view.getFloat32(base + 12, true),
    );
  }
  return { record: { id, name, stops }, next };
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// The firmware's compiled-in set (src/SystemPaletteData.hpp), as neoimage carries it.
const SYSTEM_PALETTES_BASE64 =
  "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";

/** The system palettes, ordinal in each record's id field. */
export const SYSTEM_PALETTES: readonly PaletteRecord[] = decodePaletteRecords(fromBase64(SYSTEM_PALETTES_BASE64));
