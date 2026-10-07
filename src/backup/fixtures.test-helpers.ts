// Builders for synthetic backups and pattern files, shared by the tests.

import { toBase64, utf8 } from "../formats/bytes.ts";
import { packProgramBody } from "../formats/programFile.ts";
import { compressSources } from "../formats/sources.ts";

export const ID_A = "AAAAAAAAAAAAAAAAA";
export const ID_B = "BBBBBBBBBBBBBBBBB";
export const ID_C = "CCCCCCCCCCCCCCCCC";

export interface PatternSpec {
  name: string;
  main: string;
  preview?: number[];
  bytecode?: number[];
  version?: number;
}

/** A stored program file, as a backup holds it at `/x/<id>`. */
export function pattern({ name, main, preview = [0xff, 0xd8], bytecode = [1, 2, 3], version }: PatternSpec): Uint8Array {
  const body = { name, previewJpeg: new Uint8Array(preview), binary: new Uint8Array(bytecode), sources: compressSources({ main }) };
  return packProgramBody(body, version);
}

export const json = (value: unknown) => utf8(JSON.stringify(value));

/** A `.pbb` archive's text; string contents are written as is, to test bad base64. */
export function archive(files: Record<string, Uint8Array | string>): string {
  const encoded: Record<string, string> = {};
  for (const [path, content] of Object.entries(files))
    encoded[path] = typeof content === "string" ? content : toBase64(content);
  return JSON.stringify({ files: encoded });
}

/** An `.epe` export's text. */
export function epe(spec: { id?: string; name: string; main: string; preview?: number[]; controls?: unknown }): string {
  const { id, name, main, preview = [0xff, 0xd8], controls } = spec;
  return JSON.stringify({ name, id, sources: { main }, preview: toBase64(new Uint8Array(preview)), controls });
}
