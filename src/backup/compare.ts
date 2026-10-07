/**
 * Lines up two backups' entries by key and says what changed, entry by entry and grouped the
 * way a person thinks of them: a pattern changed, and within it the code and the preview.
 */

import { bytesEqual } from "../formats/bytes.ts";
import type { Entry } from "./entries.ts";

export type Status = "added" | "removed" | "changed" | "same";

export interface EntryChange {
  key: string;
  status: Status;
  a?: Entry;
  b?: Entry;
}

export interface GroupChange {
  group: string;
  /** The group's label on each side; they differ when a pattern was renamed. */
  labelA?: string;
  labelB?: string;
  status: Status;
  entries: EntryChange[];
}

export function compareEntries(a: readonly Entry[], b: readonly Entry[]): GroupChange[] {
  const byKeyA = new Map(a.map((e) => [e.key, e]));
  const byKeyB = new Map(b.map((e) => [e.key, e]));

  const groups = new Map<string, GroupChange>();
  const keys = [...new Set([...byKeyA.keys(), ...byKeyB.keys()])];
  for (const key of keys) {
    const ea = byKeyA.get(key);
    const eb = byKeyB.get(key);
    const status: Status = !ea ? "added" : !eb ? "removed" : contentEqual(ea, eb) ? "same" : "changed";
    const groupId = (ea ?? eb)!.group;

    let group = groups.get(groupId);
    if (!group) {
      group = { group: groupId, status: "same", entries: [] };
      groups.set(groupId, group);
    }
    group.labelA ??= ea?.groupLabel;
    group.labelB ??= eb?.groupLabel;
    group.entries.push({ key, status, a: ea, b: eb });
  }

  for (const group of groups.values()) group.status = groupStatus(group.entries);
  return [...groups.values()];
}

export type Category = "pattern" | "playlist" | "other";

/** Which section a group belongs in, for anything keyed like an entry group. */
export function groupCategory(group: { group: string }): Category {
  if (group.group.startsWith("pattern/")) return "pattern";
  if (group.group.startsWith("playlist/")) return "playlist";
  return "other";
}

/** What a group is called, showing both names when a pattern was renamed. */
export function groupTitle(group: GroupChange): string {
  const { labelA, labelB } = group;
  return labelA && labelB && labelA !== labelB ? `${labelA} → ${labelB}` : (labelB ?? labelA)!;
}

function groupStatus(entries: readonly EntryChange[]): Status {
  if (entries.every((e) => e.status === "same")) return "same";
  if (entries.every((e) => e.status === "added")) return "added";
  if (entries.every((e) => e.status === "removed")) return "removed";
  return "changed";
}

function contentEqual(a: Entry, b: Entry): boolean {
  if (typeof a.content === "string" || typeof b.content === "string") return a.content === b.content;
  return bytesEqual(a.content, b.content);
}

export interface ValueChange {
  /** Dotted path to the changed value, e.g. `beat.minBpm`. */
  path: string;
  status: "added" | "removed" | "changed";
  a?: unknown;
  b?: unknown;
}

/**
 * Key-by-key differences between two parsed JSON values. Objects are walked; anything else,
 * arrays included, is compared whole, since an array's elements have no stable identity.
 */
export function diffValues(a: unknown, b: unknown, path = ""): ValueChange[] {
  if (isPlainObject(a) && isPlainObject(b)) {
    const changes: ValueChange[] = [];
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const sub = path ? `${path}.${key}` : key;
      if (!(key in a)) changes.push({ path: sub, status: "added", b: b[key] });
      else if (!(key in b)) changes.push({ path: sub, status: "removed", a: a[key] });
      else changes.push(...diffValues(a[key], b[key], sub));
    }
    return changes;
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ path, status: "changed", a, b }];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
