import { decodeAnyText, type DecodedBackup } from "../../src/backup/decode.ts";
import { toEntries, type Entry } from "../../src/backup/entries.ts";
import { backupPixelMap, type PreviewMap } from "../../src/backup/pixelMap.ts";
import type { MapChoice } from "./components/PreviewPlayer.tsx";

/** What the file pickers offer; any file can still be dropped, and is told apart by content. */
export const ACCEPTED_FILES = ".pbb,.epe,.pbp,.js,.txt,application/json";

export interface LoadedFile {
  fileName: string;
  backup: DecodedBackup;
  entries: Entry[];
  /** The device's pixel map, for a backup that has one. */
  map?: PreviewMap;
}

export async function loadFile(file: File): Promise<LoadedFile> {
  const backup = decodeAnyText(await file.text(), file.name);
  return { fileName: file.name, backup, entries: await toEntries(backup), map: backupPixelMap(backup) };
}

/** One line on what a loaded file turned out to be. */
export function describeFile({ backup }: LoadedFile): string {
  switch (backup.format) {
    case "pbb":
      return `backup: ${backup.files.length} files, ${backup.patternNames.size} patterns`;
    case "epe":
      return `pattern export: ${[...backup.patternNames.values()][0]}`;
    case "source":
      return "pattern source";
  }
}

/** A line per file that failed to decode, each prefixed to say which side it is from. */
export function undecodedFiles({ backup }: LoadedFile, prefix = ""): string[] {
  return backup.files.flatMap((f) => (f.type === "raw" && f.error ? [`${prefix}${f.path}: ${f.error}`] : []));
}

/**
 * The map to draw `file`'s previews on: its own, or else the other loaded file's, so a pattern
 * export can still be seen on the device it came from.
 */
export function mapFor(file: LoadedFile, other?: { file: LoadedFile; side: string }): MapChoice | undefined {
  if (file.map) return { map: file.map, source: "this backup" };
  if (other?.file.map) return { map: other.file.map, source: `${other.side}: ${other.file.fileName}` };
  return undefined;
}
