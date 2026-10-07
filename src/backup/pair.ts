/**
 * Decides what to compare when the two sides are not both backups. Two pattern files are two
 * versions of one pattern, whatever their ids. A pattern file against a backup is compared with
 * that pattern's copy in the backup, found by id or else by name, not with the whole backup.
 * When the formats differ, only what both can hold is compared, so an export does not show as
 * having lost the bytecode a device copy has.
 */

import type { DecodedBackup, SourceFormat } from "./decode.ts";
import { prettyJson, type Entry, type PatternMeta } from "./entries.ts";

export interface Side {
  backup: DecodedBackup;
  entries: Entry[];
}

export interface Pairing {
  a: Entry[];
  b: Entry[];
  /** How the sides were lined up, when that is not simply "both whole backups". */
  note?: string;
}

/**
 * What each format can hold of a pattern: its files, and the fields of its meta.json. Across
 * formats, anything outside the other side's sets is dropped before comparing.
 */
const CAN_HOLD: Record<SourceFormat, { files: ReadonlySet<string>; meta: ReadonlySet<keyof PatternMeta> }> = {
  pbb: {
    files: new Set(["main.js", "sources.json", "controls.json", "preview.jpg", "meta.json"]),
    meta: new Set(["id", "name", "version", "preview", "bytecode"]),
  },
  epe: {
    files: new Set(["main.js", "sources.json", "controls.json", "preview.jpg", "meta.json"]),
    meta: new Set(["id", "name", "preview"]),
  },
  source: { files: new Set(["main.js", "meta.json"]), meta: new Set(["name"]) },
};

export function pairSides(a: Side, b: Side): Pairing {
  const singleA = a.backup.format !== "pbb";
  const singleB = b.backup.format !== "pbb";
  if (!singleA && !singleB) return { a: a.entries, b: b.entries };

  if (singleA && singleB) {
    const [groupA, groupB] = [patternGroupOf(a), patternGroupOf(b)];
    const hasId = (group: string) => group !== "pattern/";
    const note =
      hasId(groupA) && hasId(groupB) && groupA !== groupB
        ? "Compared as one pattern, though the two files have different ids."
        : undefined;
    // Keyed by an id when either side has one, so the report can show it.
    const group = hasId(groupA) ? groupA : groupB;
    return trimToCommon(a, b, { a: rekey(a.entries, groupA, group), b: rekey(b.entries, groupB, group), note });
  }

  // One pattern file, one backup.
  const [pattern, backup] = singleA ? [a, b] : [b, a];
  const { group, note } = findInBackup(pattern, backup);
  const patternEntries = group ? rekey(pattern.entries, patternGroupOf(pattern), group) : pattern.entries;
  const backupEntries = group ? backup.entries.filter((e) => e.group === group) : [];
  const paired = singleA ? { a: patternEntries, b: backupEntries, note } : { a: backupEntries, b: patternEntries, note };
  return trimToCommon(a, b, paired);
}

function patternGroupOf(side: Side): string {
  const group = side.entries.find((e) => e.group.startsWith("pattern/"))?.group;
  if (!group) throw new Error("A pattern file decoded without a pattern in it.");
  return group;
}

function findInBackup(pattern: Side, backup: Side): { group?: string; note: string } {
  const file = pattern.backup.files.find((f) => f.type === "pattern");
  const { id, name } = file?.type === "pattern" ? file.pattern : { id: "", name: "" };
  const candidates = backup.backup.files.flatMap((f) => (f.type === "pattern" ? [f.pattern] : []));

  const byId = id ? candidates.find((p) => p.id === id) : undefined;
  if (byId) return { group: `pattern/${byId.id}`, note: `Compared with "${byId.name}" in the backup, matched by id.` };

  const byName =
    candidates.find((p) => p.name === name) ?? candidates.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (byName)
    return {
      group: `pattern/${byName.id}`,
      note: `Compared with "${byName.name}" [${byName.id}] in the backup, matched by name${id ? "; the ids differ" : ""}.`,
    };

  return { note: `The backup has no pattern ${id ? `with id ${id} or ` : ""}named "${name}".` };
}

/** Moves one pattern's entries to another pattern's group, so the two line up by key. */
function rekey(entries: Entry[], from: string, to: string): Entry[] {
  if (from === to) return entries;
  return entries.map((e) => (e.group === from ? { ...e, group: to, key: to + e.key.slice(from.length) } : e));
}

/**
 * Across formats, drops pattern files the other format cannot hold and meta fields the other
 * side's meta lacks, so only real differences show.
 */
function trimToCommon(a: Side, b: Side, paired: Pairing): Pairing {
  if (a.backup.format === b.backup.format) return paired;
  const [holdsA, holdsB] = [CAN_HOLD[a.backup.format], CAN_HOLD[b.backup.format]];
  const allowed = (file: string) => holdsA.files.has(file) && holdsB.files.has(file);

  const keep = (e: Entry) => !e.group.startsWith("pattern/") || allowed(e.key.slice(e.group.length + 1));
  const [entriesA, entriesB] = [paired.a.filter(keep), paired.b.filter(keep)];

  const fields = (key: string) => holdsA.meta.has(key as keyof PatternMeta) && holdsB.meta.has(key as keyof PatternMeta);
  const trim = (e: Entry): Entry => {
    if (!e.group.startsWith("pattern/") || !e.key.endsWith("/meta.json")) return e;
    const value = Object.fromEntries(Object.entries(e.value as PatternMeta).filter(([key]) => fields(key)));
    return { ...e, content: prettyJson(value), value };
  };
  return { ...paired, a: entriesA.map(trim), b: entriesB.map(trim) };
}
