/**
 * A pattern preview's frames: the JPEG stacks one captured frame per row, one column per pixel
 * (neoimage www/src/preview/thumbnail.ts), so decoding it gives every frame's colors at once.
 * The stored colors are gamma-encoded for display already, so they are drawn as they are.
 */

import { useEffect, useState } from "preact/hooks";

import type { Entry } from "../../../src/backup/entries.ts";

export interface PreviewFrames {
  /** Columns: pixels, or fewer for a strip longer than the capture width. */
  width: number;
  /** Rows: frames, oldest first. */
  height: number;
  data: Uint8ClampedArray;
}

const decoded = new WeakMap<Entry, Promise<PreviewFrames | undefined>>();

export function loadFrames(entry: Entry): Promise<PreviewFrames | undefined> {
  let pending = decoded.get(entry);
  if (!pending) {
    pending = decode(entry.content as Uint8Array<ArrayBuffer>);
    decoded.set(entry, pending);
  }
  return pending;
}

async function decode(bytes: Uint8Array<ArrayBuffer>): Promise<PreviewFrames | undefined> {
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context || bitmap.width === 0 || bitmap.height === 0) return undefined;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
  } catch {
    return undefined;
  }
}

/** Undefined while decoding, for no entry, or when the image does not decode. */
export function useFrames(entry: Entry | undefined): PreviewFrames | undefined {
  const [frames, setFrames] = useState<PreviewFrames>();
  useEffect(() => {
    setFrames(undefined);
    if (!entry) return;
    let current = true;
    void loadFrames(entry).then((f) => current && setFrames(f));
    return () => {
      current = false;
    };
  }, [entry]);
  return frames;
}
