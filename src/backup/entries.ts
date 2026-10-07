/**
 * Flattens a decoded backup into readable files: what a diff tool compares when a backup is
 * exploded to disk, and what the web app compares in memory. Each entry has two names. `key`
 * is stable across backups (pattern id, not name), so a renamed pattern still lines up with
 * itself. `path` is for people, so a pattern's folder carries its name.
 */

import { fromUtf8, sha256 } from "../formats/bytes.ts";
import type { DecodedBackup, DecodedFile, DecodedPattern } from "./decode.ts";

export type EntryKind = "text" | "image" | "binary";

export interface Entry {
  key: string;
  path: string;
  kind: EntryKind;
  content: string | Uint8Array;
  /** Entries that belong together (a pattern's code, controls, preview) share a group. */
  group: string;
  groupLabel: string;
  /** The parsed form for JSON-like entries, for comparing key by key rather than by line. */
  value?: unknown;
}

/** Facts about a pattern that have no file of their own; fields a format lacks are left out. */
export interface EntryGroup {
  group: string;
  label: string;
  entries: Entry[];
}

/** One file's entries gathered by group, in the order they first appear. */
export function groupEntries(entries: readonly Entry[]): EntryGroup[] {
  const groups = new Map<string, EntryGroup>();
  for (const entry of entries) {
    let group = groups.get(entry.group);
    if (!group) groups.set(entry.group, (group = { group: entry.group, label: entry.groupLabel, entries: [] }));
    group.entries.push(entry);
  }
  return [...groups.values()];
}

export interface PatternMeta {
  id: string;
  name: string;
  version?: number;
  preview: { bytes: number; sha256: string };
  bytecode?: { bytes: number; sha256: string };
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|ico|bmp|webp|svg)$/i;

export async function toEntries(backup: DecodedBackup): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (const file of backup.files) entries.push(...(await fileEntries(file, backup.patternNames)));
  return entries;
}

async function fileEntries(file: DecodedFile, names: Map<string, string>): Promise<Entry[]> {
  switch (file.type) {
    case "pattern":
      return patternEntries(file.pattern);

    case "controls": {
      const { group, groupLabel, dir } = patternGroup(file.id, names.get(file.id));
      return [{ group, groupLabel, key: `${group}/controls.json`, path: `${dir}/controls.json`, kind: "text", content: prettyJson(file.value), value: file.value }];
    }

    case "playlist": {
      const name = file.name;
      const group = { group: `playlist/${name}`, groupLabel: `playlist ${name}` };
      const lines = file.items.map(({ id, ms }) => `${ms} ms\t${names.get(id) ?? "(not in backup)"} [${id}]`);
      return [
        { ...group, key: `playlist/${name}.json`, path: `playlists/${safeName(name)}.json`, kind: "text", content: prettyJson(file.value), value: file.value },
        { ...group, key: `playlist/${name}.txt`, path: `playlists/${safeName(name)}.txt`, kind: "text", content: lines.join("\n") + "\n" },
      ];
    }

    case "json":
      return [single(file.path, file.path.slice(1), "text", prettyJson(file.value), file.value)];

    case "pixelmapText":
      return [single(file.path, "pixelmap.txt", "text", linePerItem(file.value))];

    case "pixelmapData": {
      const text = `dimensions: ${file.map.dimensions}\n` + file.map.points.map((p) => p.join("\t")).join("\n") + "\n";
      return [single(file.path, "pixelmap.dat.txt", "text", text)];
    }

    case "raw": {
      if (!file.bytes) return [];
      return [single(file.path, `files${file.path}`, rawKind(file.path, file.bytes), rawContent(file.path, file.bytes))];
    }
  }
}

async function patternEntries(pattern: DecodedPattern): Promise<Entry[]> {
  const group = patternGroup(pattern.id, pattern.name);
  const entry = (name: string, kind: EntryKind, content: string | Uint8Array, value?: unknown): Entry => ({
    group: group.group,
    groupLabel: group.groupLabel,
    key: `${group.group}/${name}`,
    path: `${group.dir}/${name}`,
    kind,
    content,
    value,
  });

  const meta: PatternMeta = {
    id: pattern.id,
    name: pattern.name,
    version: pattern.version,
    preview: { bytes: pattern.previewJpeg.length, sha256: await sha256(pattern.previewJpeg) },
    bytecode: pattern.bytecode && { bytes: pattern.bytecode.length, sha256: await sha256(pattern.bytecode) },
  };

  // `main` gets a file of its own when it is code; anything else (old exports' bare `src`
  // bodies, blockly) goes in sources.json as stored.
  const { main, ...otherSources } = pattern.sources;
  const rest = typeof main === "string" || main === undefined ? otherSources : pattern.sources;
  const entries: Entry[] = [];
  if (typeof main === "string") entries.push(entry("main.js", "text", main));
  if (Object.keys(rest).length > 0) entries.push(entry("sources.json", "text", prettyJson(rest), rest));
  if (pattern.previewJpeg.length > 0) entries.push(entry("preview.jpg", "image", pattern.previewJpeg));
  entries.push(entry("meta.json", "text", prettyJson(meta), meta));
  return entries;
}

function patternGroup(id: string, name: string | undefined) {
  return {
    group: `pattern/${id}`,
    groupLabel: name ?? `(unknown pattern ${id})`,
    dir: `patterns/${safeName(name ?? "unknown")}${id ? ` (${id})` : ""}`,
  };
}

/** A file that is a group of its own, keyed by its device path. */
function single(devicePath: string, path: string, kind: EntryKind, content: string | Uint8Array, value?: unknown): Entry {
  const key = devicePath.slice(1);
  return { key, path, kind, content, group: key, groupLabel: devicePath, value };
}

function rawKind(path: string, bytes: Uint8Array): EntryKind {
  if (IMAGE_EXTENSIONS.test(path)) return "image";
  return asText(bytes) === undefined ? "binary" : "text";
}

function rawContent(path: string, bytes: Uint8Array): string | Uint8Array {
  return rawKind(path, bytes) === "text" ? (asText(bytes) as string) : bytes;
}

/** The bytes as text, if they are UTF-8 with no control characters a text file would not have. */
function asText(bytes: Uint8Array): string | undefined {
  if (bytes.length === 0) return "";
  try {
    const text = fromUtf8(bytes);
    return /[\x00-\x08\x0e-\x1f]/.test(text) ? undefined : text;
  } catch {
    return undefined;
  }
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

/** A JSON array with each element on its own line, so a diff points at the items that moved. */
function linePerItem(items: unknown[]): string {
  if (items.length === 0) return "[]\n";
  return "[\n" + items.map((item) => "  " + JSON.stringify(item)).join(",\n") + "\n]\n";
}

/** A pattern or playlist name made safe to use as a file name on any OS. */
export function safeName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 80);
  return cleaned || "untitled";
}

/** Every file in the archive with its size and hash, including ones that did not decode. */
export async function manifest(backup: DecodedBackup): Promise<string> {
  const lines: string[] = [];
  for (const file of backup.files) {
    const hash = file.bytes ? await sha256(file.bytes) : "-".repeat(64);
    const size = String(file.bytes?.length ?? "-").padStart(8);
    const error = file.type === "raw" && file.error ? `  ! ${file.error}` : "";
    lines.push(`${hash}  ${size}  ${file.type.padEnd(12)}  ${file.path}${error}`);
  }
  return lines.join("\n") + "\n";
}
