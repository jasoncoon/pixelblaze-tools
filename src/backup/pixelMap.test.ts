import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { concatBytes, u32le } from "../formats/bytes.ts";
import { decodeBackupText } from "./decode.ts";
import { archive, json } from "./fixtures.test-helpers.ts";
import { backupPixelMap, previewColumn } from "./pixelMap.ts";

function pixelMapDat(dimensions: number, coords: number[]): Uint8Array {
  const bytes = new Uint8Array(new Uint16Array(coords).buffer);
  return concatBytes([u32le(2, dimensions, bytes.length), bytes]);
}

describe("backupPixelMap", () => {
  it("reads the map and the configured pixel count", () => {
    const backup = decodeBackupText(
      archive({
        "/config.json": json({ pixelCount: 3 }),
        "/pixelmap.dat": pixelMapDat(2, [0, 0, 65535, 16384, 32768, 32768]),
      }),
    );
    const map = backupPixelMap(backup);
    assert.equal(map?.dimensions, 2);
    assert.deepEqual(map?.points, [[0, 0], [65535, 16384], [32768, 32768]]);
    assert.equal(map?.pixelCount, 3);
    assert.ok(Math.abs(map!.smallestRatio - 0.5) < 1e-4);
  });

  it("falls back to the point count without a config, and to nothing without a map", () => {
    const withMap = decodeBackupText(archive({ "/pixelmap.dat": pixelMapDat(1, [0, 100, 200]) }));
    assert.equal(backupPixelMap(withMap)?.pixelCount, 3);
    assert.equal(backupPixelMap(decodeBackupText(archive({ "/config.json": json({}) }))), undefined);
    assert.equal(backupPixelMap(decodeBackupText(archive({ "/pixelmap.dat": pixelMapDat(0, []) }))), undefined);
  });
});

describe("previewColumn", () => {
  it("is one column per pixel when the preview is as wide as the strip", () => {
    assert.deepEqual([0, 1, 255].map((i) => previewColumn(i, 256, 256)), [0, 1, 255]);
  });

  it("spreads a narrower preview across the pixels", () => {
    assert.deepEqual([0, 1, 2, 3, 299].map((i) => previewColumn(i, 100, 300)), [0, 0, 0, 1, 99]);
  });
});
