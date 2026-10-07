import { useState } from "preact/hooks";

import { groupCategory, groupTitle, type EntryChange, type GroupChange } from "../../../src/backup/compare.ts";
import type { Entry } from "../../../src/backup/entries.ts";
import { PATTERN_PARTS } from "../../../src/backup/summary.ts";
import { BinaryDiff } from "./BinaryDiff.tsx";
import { languageFor } from "./CodeView.tsx";
import { ImageDiff } from "./ImageDiff.tsx";
import { PreviewCompare, type MapChoice } from "./PreviewPlayer.tsx";
import { MARK } from "./Sidebar.tsx";
import { TextDiff } from "./TextDiff.tsx";

/** Tab order within a pattern: what people change most first. */
const PATTERN_ORDER = ["main.js", "controls.json", "preview.jpg", "sources.json", "meta.json"];
/** A playlist reads better by name than as the JSON the device stores. */
const PLAYLIST_ORDER = [".txt", ".json"];

interface Props {
  group: GroupChange;
  /** Each side's pixel map, for animating pattern previews on. */
  maps?: { a?: MapChoice; b?: MapChoice };
  /** How the two files were lined up, when they are not both backups. */
  note?: string;
  sideBySide: boolean;
  onSideBySide: (value: boolean) => void;
}

export function GroupView({ group, maps, note, sideBySide, onSideBySide }: Props) {
  const entries = ordered(group);
  const [tab, setTab] = useState(() => (entries.find((e) => e.status !== "same") ?? entries[0]).key);
  const current = entries.find((e) => e.key === tab) ?? entries[0];
  const view = viewOf(current);

  return (
    <div class="group-view">
      <header class="group-header">
        <div>
          <h2>
            <span class={`badge status-${group.status}`}>{group.status}</span> {groupTitle(group)}
          </h2>
          <Paths change={current} />
          {note && <p class="note-line">{note}</p>}
        </div>
        {view === "text" && (
          <label class="check">
            <input type="checkbox" checked={sideBySide} onChange={(e) => onSideBySide(e.currentTarget.checked)} />
            Side by side
          </label>
        )}
      </header>

      {entries.length > 1 && (
        <div class="tabs" role="tablist">
          {entries.map((e) => (
            <button
              key={e.key}
              role="tab"
              aria-selected={e.key === current.key}
              class={`tab status-${e.status}`}
              onClick={() => setTab(e.key)}
            >
              <span class="mark" aria-label={e.status}>{MARK[e.status]}</span> {tabLabel(group, e)}
            </button>
          ))}
        </div>
      )}

      <div class="entry-view">
        {current.status === "same" && view !== "text" && <p class="muted note">Identical in both backups.</p>}
        {view === "text" && <TextEntry change={current} sideBySide={sideBySide} />}
        {view === "image" &&
          (groupCategory(group) === "pattern" && current.key.endsWith("/preview.jpg") ? (
            <PreviewCompare
              sides={[
                { entry: current.a, map: maps?.a, label: "A" },
                { entry: current.b, map: maps?.b, label: "B" },
              ]}
            />
          ) : (
            <ImageDiff a={current.a} b={current.b} />
          ))}
        {view === "binary" && <BinaryDiff a={current.a} b={current.b} />}
      </div>
    </div>
  );
}

function TextEntry({ change, sideBySide }: { change: EntryChange; sideBySide: boolean }) {
  const text = (e?: Entry) => (typeof e?.content === "string" ? e.content : "");
  const path = (change.b ?? change.a)!.path;
  const language = languageFor(path);
  return (
    <>
      {change.status === "same" && <p class="muted note">Identical in both backups.</p>}
      <TextDiff original={text(change.a)} modified={text(change.b)} language={language} sideBySide={sideBySide} />
    </>
  );
}

function Paths({ change }: { change: EntryChange }) {
  const { a, b } = change;
  if (a && b && a.path !== b.path)
    return (
      <p class="paths muted">
        A: {a.path}
        <br />
        B: {b.path}
      </p>
    );
  return <p class="paths muted">{(b ?? a)!.path}</p>;
}

function viewOf({ a, b }: EntryChange): Entry["kind"] {
  const kinds = new Set([a?.kind, b?.kind].filter((k) => k !== undefined));
  return kinds.size === 1 ? [...kinds][0]! : "binary";
}

function suffix(group: GroupChange, change: EntryChange): string {
  return change.key.slice(group.group.length);
}

function ordered(group: GroupChange): EntryChange[] {
  const category = groupCategory(group);
  const order = category === "pattern" ? PATTERN_ORDER.map((f) => `/${f}`) : category === "playlist" ? PLAYLIST_ORDER : [];
  const rank = (c: EntryChange) => {
    const i = order.indexOf(suffix(group, c));
    return i === -1 ? order.length : i;
  };
  return [...group.entries].sort((x, y) => rank(x) - rank(y));
}

function tabLabel(group: GroupChange, change: EntryChange): string {
  const rest = suffix(group, change);
  switch (groupCategory(group)) {
    case "pattern":
      return PATTERN_PARTS[rest.slice(1)] ?? rest.slice(1).replace(/\.json$/, "");
    case "playlist":
      return rest === ".txt" ? "by name" : "JSON";
    default:
      return (change.b ?? change.a)!.path;
  }
}
