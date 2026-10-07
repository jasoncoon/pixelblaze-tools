/**
 * The `.pbb` backup archive: every file on the device, base64 in one JSON object. Same shape
 * as neoimage www/src/formats/backup.ts, but read leniently: a diff should show whatever an
 * archive holds, including firmware files and entries that would not restore.
 */

import { fromBase64 } from "./bytes.ts";

export interface BackupArchive {
  /** Device path, as `/name.ext`, to the file's contents in base64 with no data: prefix. */
  files: Record<string, string>;
}

export interface ArchiveFile {
  path: string;
  /** Absent when the entry is not valid base64; `error` says why. */
  bytes?: Uint8Array<ArrayBuffer>;
  error?: string;
}

export function readBackupArchive(text: string): ArchiveFile[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Not a backup archive: the file is not JSON.");
  }

  const raw: unknown = (parsed as { files?: unknown } | null)?.files;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Not a backup archive: no files in it.");

  return Object.entries(raw).map(([path, base64]): ArchiveFile => {
    if (typeof base64 !== "string") return { path, error: "entry is not a string" };
    try {
      return { path, bytes: fromBase64(base64) };
    } catch {
      return { path, error: "entry is not base64" };
    }
  });
}
