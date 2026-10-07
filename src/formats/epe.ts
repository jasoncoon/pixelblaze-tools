/**
 * The `.epe` pattern export: one pattern as JSON, `{ name, id, sources, preview, controls }`,
 * with the preview JPEG in base64. Read the way neoimage's parseEpeFile reads it, except that
 * the first format's bare `src`/`gsrc` bodies are kept as they are rather than converted: a
 * diff should show what the file holds.
 */

import { fromBase64 } from "./bytes.ts";

export interface EpeFile {
  name: string;
  /** Empty when the file has none, as the oldest exports do not. */
  id: string;
  sources: Record<string, unknown>;
  previewJpeg: Uint8Array<ArrayBuffer>;
  controls?: Record<string, unknown>;
}

/** Throws when the JSON is not a pattern export. */
export function readEpe(json: unknown): EpeFile {
  if (!isObject(json)) throw new Error("Not a pattern file: not a JSON object.");

  let sources: Record<string, unknown>;
  if (isObject(json.sources)) sources = json.sources;
  else if (typeof json.src === "string") sources = typeof json.gsrc === "string" ? { src: json.src, gsrc: json.gsrc } : { src: json.src };
  else throw new Error("Not a pattern file: no sources in it.");

  let previewJpeg = new Uint8Array(0);
  if (typeof json.preview === "string" && json.preview) {
    try {
      previewJpeg = fromBase64(json.preview);
    } catch {
      throw new Error("Not a usable pattern file: the preview is not base64.");
    }
  }

  return {
    name: typeof json.name === "string" ? json.name : "",
    id: typeof json.id === "string" ? json.id : "",
    sources,
    previewJpeg,
    controls: isObject(json.controls) ? json.controls : undefined,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
