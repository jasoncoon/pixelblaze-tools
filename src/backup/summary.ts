/**
 * A plain-text report of what changed between two backups: patterns by name with the parts
 * that changed, playlist edits, and settings key by key.
 */

import { diffValues, groupCategory, groupTitle, type EntryChange, type GroupChange, type Status, type ValueChange } from "./compare.ts";
import type { PatternMeta } from "./entries.ts";
import type { PlaylistItem } from "./decode.ts";

const MARK: Record<Status, string> = { added: "+", removed: "-", changed: "~", same: " " };

/** Section of a pattern folder → what a person calls it in the report. */
export const PATTERN_PARTS: Record<string, string> = {
  "main.js": "code",
  "sources.json": "sources",
  "controls.json": "controls",
  "preview.jpg": "preview",
};

export function summarize(groups: readonly GroupChange[], patternNames: ReadonlyMap<string, string>): string {
  const patterns = groups.filter((g) => groupCategory(g) === "pattern");
  const playlists = groups.filter((g) => groupCategory(g) === "playlist");
  const others = groups.filter((g) => groupCategory(g) === "other");

  const out: string[] = [];
  section(out, "Patterns", patterns, patternLines);
  section(out, "Playlists", playlists, (g) => playlistLines(g, patternNames));
  section(out, "Settings and other files", others, otherLines);
  return out.join("\n") + "\n";
}

function section(out: string[], title: string, groups: readonly GroupChange[], describe: (g: GroupChange) => string[]) {
  // Comparing pattern files leaves the backup-only sections empty; they would only be noise.
  if (groups.length === 0) return;
  const counts = (status: Status) => groups.filter((g) => g.status === status).length;
  out.push(`${title}: ${counts("added")} added, ${counts("removed")} removed, ${counts("changed")} changed, ${counts("same")} unchanged`);

  const differing = groups
    .filter((g) => g.status !== "same")
    .sort((a, b) => label(a).localeCompare(label(b), undefined, { sensitivity: "base" }));
  for (const group of differing) out.push(...describe(group));
  out.push("");
}

function label(group: GroupChange): string {
  return (group.labelB ?? group.labelA)!;
}

function patternLines(group: GroupChange): string[] {
  const id = group.group.slice("pattern/".length);
  const head = `  ${MARK[group.status]} ${groupTitle(group)}${id ? ` [${id}]` : ""}`;
  if (group.status !== "changed") return [head];

  const parts: string[] = [];
  const details: string[] = [];
  for (const change of group.entries) {
    if (change.status === "same") continue;
    const file = change.key.slice(group.group.length + 1);

    if (file === "meta.json") {
      parts.push(...metaParts(change));
      continue;
    }
    const part = PATTERN_PARTS[file] ?? file;
    parts.push(change.status === "changed" ? part : `${part} ${change.status}`);
    if (file === "controls.json" && change.status === "changed")
      details.push(...valueLines(diffValues(change.a!.value, change.b!.value)));
  }
  return [`${head}: ${parts.join(", ")}`, ...details];
}

function metaParts(change: EntryChange): string[] {
  const a = change.a?.value as PatternMeta | undefined;
  const b = change.b?.value as PatternMeta | undefined;
  if (!a || !b) return [];
  const parts: string[] = [];
  if (a.name !== b.name) parts.push("renamed");
  if (a.version !== undefined && b.version !== undefined && a.version !== b.version)
    parts.push(`file version ${a.version} → ${b.version}`);
  if (a.bytecode && b.bytecode && a.bytecode.sha256 !== b.bytecode.sha256) parts.push("bytecode");
  return parts;
}

function playlistLines(group: GroupChange, names: ReadonlyMap<string, string>): string[] {
  const head = `  ${MARK[group.status]} ${group.group.slice("playlist/".length)}`;
  const json = group.entries.find((e) => e.key.endsWith(".json"));
  if (group.status !== "changed" || !json?.a?.value || !json.b?.value) return [head];

  const a = (json.a.value as { items: PlaylistItem[] }).items;
  const b = (json.b.value as { items: PlaylistItem[] }).items;
  const msA = new Map(a.map((item) => [item.id, item.ms]));
  const msB = new Map(b.map((item) => [item.id, item.ms]));
  const name = (id: string) => `${names.get(id) ?? "(not in backup)"} [${id}]`;

  const lines: string[] = [];
  for (const { id, ms } of b) if (!msA.has(id)) lines.push(`      + ${name(id)} (${ms} ms)`);
  for (const { id } of a) if (!msB.has(id)) lines.push(`      - ${name(id)}`);
  for (const [id, ms] of msA) {
    const after = msB.get(id);
    if (after !== undefined && after !== ms) lines.push(`      ~ ${name(id)}: ${ms} → ${after} ms`);
  }

  const orderA = a.map((item) => item.id).filter((id) => msB.has(id));
  const orderB = b.map((item) => item.id).filter((id) => msA.has(id));
  if (orderA.join() !== orderB.join()) lines.push("      reordered");

  return [`${head}: ${a.length} → ${b.length} items`, ...lines];
}

function otherLines(group: GroupChange): string[] {
  const lines: string[] = [];
  for (const change of group.entries) {
    if (change.status === "same") continue;
    const path = (change.b ?? change.a)!.path;
    lines.push(`  ${MARK[change.status]} ${path}`);
    if (change.status === "changed" && change.a?.value !== undefined && change.b?.value !== undefined)
      lines.push(...valueLines(diffValues(change.a.value, change.b.value)));
  }
  return lines;
}

function valueLines(changes: readonly ValueChange[]): string[] {
  return changes.map((c) => {
    const path = c.path || "(whole value)";
    if (c.status === "added") return `      + ${path}: ${brief(c.b)}`;
    if (c.status === "removed") return `      - ${path}: ${brief(c.a)}`;
    return `      ~ ${path}: ${brief(c.a)} → ${brief(c.b)}`;
  });
}

function brief(value: unknown, max = 60): string {
  const text = JSON.stringify(value) ?? "undefined";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}
