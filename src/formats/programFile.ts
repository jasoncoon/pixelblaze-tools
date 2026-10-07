// Ported from neoimage www/src/formats/programFile.ts.

import { concatBytes, fromUtf8, u32le, utf8 } from "./bytes.ts";

export const PROGRAM_FILE_VERSION = 3;

/** Version 2 is the same four sections in the same order and differs only in this word. */
export const LEGACY_PROGRAM_FILE_VERSION = 2;

const READABLE_VERSIONS = [LEGACY_PROGRAM_FILE_VERSION, PROGRAM_FILE_VERSION];

/** Pattern ids are fixed-width; the device names the stored file `/x/<id>`. */
export const PROGRAM_ID_LENGTH = 17;

const SECTION_COUNT = 4;
const HEADER_BYTES = (SECTION_COUNT * 2 + 1) * 4;

/**
 * Section payloads of a stored pattern. `sources` is the LZ-String-compressed JSON project
 * document (see sources.ts).
 */
export interface ProgramFileBody {
  name: string;
  previewJpeg: Uint8Array;
  binary: Uint8Array;
  sources: Uint8Array;
}

export interface ParsedProgramBody extends ProgramFileBody {
  version: number;
}

/**
 * A stored pattern, byte for byte as it sits on the device: a header of one version word
 * and an (offset, length) pair per section, then the sections back to back. Offsets are
 * measured from the start of the header.
 */
export function packProgramBody(parts: ProgramFileBody, version = PROGRAM_FILE_VERSION): Uint8Array {
  const sections = [utf8(parts.name), parts.previewJpeg, parts.binary, parts.sources];

  const header: number[] = [version];
  let nextOffset = HEADER_BYTES;
  for (const section of sections) {
    header.push(nextOffset, section.length);
    nextOffset += section.length;
  }

  return concatBytes([u32le(...header), ...sections]);
}

export function unpackProgramBody(bytes: Uint8Array): ParsedProgramBody {
  if (bytes.length < HEADER_BYTES) throw new Error("program file truncated");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(0, true);
  if (!READABLE_VERSIONS.includes(version)) {
    throw new Error(`unsupported program file version ${version}`);
  }

  const sections: Uint8Array[] = [];
  for (let i = 0; i < SECTION_COUNT; i++) {
    const offset = view.getUint32(4 + i * 8, true);
    const length = view.getUint32(8 + i * 8, true);
    if (offset + length > bytes.length) throw new Error(`program file section ${i} out of range`);
    sections.push(bytes.slice(offset, offset + length));
  }

  return {
    version,
    name: fromUtf8(sections[0]),
    previewJpeg: sections[1],
    binary: sections[2],
    sources: sections[3],
  };
}
