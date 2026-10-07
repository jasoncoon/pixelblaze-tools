// Ported from neoimage www/src/formats/sources.ts.

// lz-string's package assigns `module.exports = LZString` rather than individual named
// exports, which Node's CJS/ESM interop cannot see statically; a default import is the form
// both Node and bundlers resolve reliably.
import LZString from "lz-string";

/**
 * The `sources` section of a stored pattern: an LZ-String-compressed JSON project document,
 * `{ main, blockly? }`.
 */
export function decompressSources(bytes: Uint8Array): unknown {
  const json = LZString.decompressFromUint8Array(bytes);
  if (json === null) throw new Error("sources failed to decompress");
  return JSON.parse(json);
}

export function compressSources(sources: unknown): Uint8Array {
  return LZString.compressToUint8Array(JSON.stringify(sources));
}
