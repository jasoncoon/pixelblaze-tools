/**
 * Turns a backup archive's files into what they mean: patterns with their sources unpacked,
 * controls and playlists parsed, the pixel map as points. Anything that does not decode stays
 * a raw file with the reason recorded, so nothing in an archive is ever dropped from a diff.
 *
 * A single pattern file (`.epe`, or bare source) decodes to the same shape, as a backup holding
 * just that pattern, so everything downstream compares it the same way.
 */

import { readBackupArchive, type ArchiveFile } from "../formats/backup.ts";
import { fromUtf8 } from "../formats/bytes.ts";
import { readEpe } from "../formats/epe.ts";
import { decodePixelMap, type DecodedPixelMap } from "../formats/pixelMap.ts";
import { PROGRAM_ID_LENGTH, unpackProgramBody } from "../formats/programFile.ts";
import { decompressSources } from "../formats/sources.ts";

export interface DecodedPattern {
  /** Empty for a pattern file that carries none (bare source, the oldest exports). */
  id: string;
  name: string;
  /** The program file's version word; only a device's stored copy has one. */
  version?: number;
  /** The decompressed project document, normally `{ main }`, sometimes with `blockly`. */
  sources: Record<string, unknown>;
  previewJpeg: Uint8Array<ArrayBuffer>;
  /** Only a device's stored copy has compiled bytecode; an export or bare source does not. */
  bytecode?: Uint8Array<ArrayBuffer>;
}

export interface PlaylistItem {
  id: string;
  ms: number;
}

interface FileBase {
  path: string;
  /** The file's contents as stored; absent only when the archive entry was not base64. */
  bytes?: Uint8Array<ArrayBuffer>;
}

export type DecodedFile = FileBase &
  (
    | { type: "pattern"; pattern: DecodedPattern }
    | { type: "controls"; id: string; value: unknown }
    | { type: "playlist"; name: string; items: PlaylistItem[]; value: unknown }
    | { type: "json"; value: unknown }
    | { type: "pixelmapText"; value: unknown[] }
    | { type: "pixelmapData"; map: DecodedPixelMap }
    /** Not a recognized format, or a recognized one that failed to decode (see `error`). */
    | { type: "raw"; error?: string }
  );

/** What a file was read as, which decides what it can be compared on (see pair.ts). */
export type SourceFormat = "pbb" | "epe" | "source";

export interface DecodedBackup {
  format: SourceFormat;
  files: DecodedFile[];
  /** Pattern names by id, for labelling controls and playlist items. */
  patternNames: Map<string, string>;
}

const PATTERN_PATH = new RegExp(`^/x/([^/.]{${PROGRAM_ID_LENGTH}})$`);
const CONTROLS_PATH = new RegExp(`^/x/([^/.]{${PROGRAM_ID_LENGTH}})\\.c$`);
const PLAYLIST_PATH = /^\/l\/([^/]+)$/;

/** Bare pattern source, named after the file, as neoimage opens these extensions. */
const SOURCE_EXTENSIONS = /\.(pbp|js|txt)$/i;

/**
 * Any file the tools compare: a backup or an `.epe`, told apart by content so a misnamed file
 * still opens, or bare pattern source, told apart by extension since any text would pass for it.
 */
export function decodeAnyText(text: string, fileName: string): DecodedBackup {
  if (SOURCE_EXTENSIONS.test(fileName)) return decodeSource(text, fileName);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Not a backup or pattern file: it is not JSON.");
  }
  if (json && typeof json === "object" && "files" in json) return decodeBackup(readBackupArchive(text));
  const { controls, ...pattern } = readEpe(json);
  return singlePattern("epe", fileName, { ...pattern, name: pattern.name || baseName(fileName) }, controls);
}

export function decodeBackupText(text: string): DecodedBackup {
  return decodeBackup(readBackupArchive(text));
}

function decodeSource(text: string, fileName: string): DecodedBackup {
  const pattern = { id: "", name: baseName(fileName), sources: { main: text }, previewJpeg: new Uint8Array(0) };
  return singlePattern("source", fileName, pattern);
}

/** A file's name without its folder or extension. */
function baseName(fileName: string): string {
  return fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
}

function singlePattern(format: SourceFormat, fileName: string, pattern: DecodedPattern, controls?: unknown): DecodedBackup {
  const files: DecodedFile[] = [{ path: fileName, type: "pattern", pattern }];
  if (controls !== undefined) files.push({ path: `${fileName} (controls)`, type: "controls", id: pattern.id, value: controls });
  return { format, files, patternNames: new Map([[pattern.id, pattern.name]]) };
}

export function decodeBackup(archive: ArchiveFile[]): DecodedBackup {
  const files = [...archive]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(decodeFile);

  const patternNames = new Map<string, string>();
  for (const file of files) if (file.type === "pattern") patternNames.set(file.pattern.id, file.pattern.name);

  return { format: "pbb", files, patternNames };
}

function decodeFile({ path, bytes, error }: ArchiveFile): DecodedFile {
  if (!bytes) return { path, type: "raw", error };
  try {
    return decodeKnown(path, bytes) ?? { path, bytes, type: "raw" };
  } catch (e) {
    return { path, bytes, type: "raw", error: e instanceof Error ? e.message : String(e) };
  }
}

/** The decoded form of a file in a known format, undefined for one that is not, or throws. */
function decodeKnown(path: string, bytes: Uint8Array<ArrayBuffer>): DecodedFile | undefined {
  let match: RegExpMatchArray | null;

  if ((match = path.match(PATTERN_PATH))) {
    const body = unpackProgramBody(bytes);
    const sources = decompressSources(body.sources);
    if (!sources || typeof sources !== "object" || Array.isArray(sources))
      throw new Error("pattern sources are not an object");
    const pattern: DecodedPattern = {
      id: match[1],
      name: body.name,
      version: body.version,
      sources: sources as Record<string, unknown>,
      previewJpeg: body.previewJpeg as Uint8Array<ArrayBuffer>,
      bytecode: body.binary as Uint8Array<ArrayBuffer>,
    };
    return { path, bytes, type: "pattern", pattern };
  }

  if ((match = path.match(CONTROLS_PATH)))
    return { path, bytes, type: "controls", id: match[1], value: parseJson(bytes) };

  if ((match = path.match(PLAYLIST_PATH))) {
    const value = parseJson(bytes);
    const items = (value as { items?: unknown } | null)?.items;
    if (!Array.isArray(items) || !items.every(isPlaylistItem)) throw new Error("not a playlist");
    return { path, bytes, type: "playlist", name: match[1], items, value };
  }

  if (path === "/pixelmap.txt") {
    const value = parseJson(bytes);
    if (!Array.isArray(value)) throw new Error("pixel map is not an array");
    return { path, bytes, type: "pixelmapText", value };
  }

  if (path === "/pixelmap.dat") return { path, bytes, type: "pixelmapData", map: decodePixelMap(bytes) };

  if (path.endsWith(".json")) return { path, bytes, type: "json", value: parseJson(bytes) };

  return undefined;
}

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(fromUtf8(bytes));
}

function isPlaylistItem(item: unknown): item is PlaylistItem {
  const { id, ms } = (item ?? {}) as Partial<PlaylistItem>;
  return typeof id === "string" && typeof ms === "number";
}
